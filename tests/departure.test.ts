import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../api/_lib/schema.js';
const backend = vi.hoisted(() => ({ db: null as any }));
vi.mock('../api/_lib/db.js', async () => ({
  schema: await import('../api/_lib/schema.js'),
  db: new Proxy({}, { get: (_, name) => { const value = backend.db[name]; return typeof value === 'function' ? value.bind(backend.db) : value; } }),
}));
vi.mock('../api/_lib/context.js', () => ({ withHousehold: (fn: unknown) => fn, withUser: (fn: unknown) => fn }));
import { DELETE as remove } from '../api/_lib/handlers/member-admin.js';
import { POST as join } from '../api/_lib/handlers/join.js';
import { GET as listMembers } from '../api/_lib/handlers/members.js';
import { getBalances, listExpenses, createPayment, reviewPayment, createExpense } from '../api/_lib/finance.js';
import { createEvent, postNote } from '../api/_lib/calendar.js';
import { createChore } from '../api/_lib/chores.js';
const pg = new PGlite();
const asUser = (userId: number) => ({ userId,firstName:'Test',lastName:'User' }) as any;
const removeContext = (actor=1, target=2, role='owner') => ({user:asUser(actor),householdId:1,role,req:new Request(`http://localhost/api/households/1/members/${target}`)}) as any;
beforeAll(async () => {
  await pg.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
  backend.db = drizzle(pg, {schema});
}, 20000);
beforeEach(async () => {
  await pg.exec(`TRUNCATE household,users RESTART IDENTITY CASCADE;
    INSERT INTO users(first_name,last_name,email) VALUES ('Owner','One','a@example.test'),('Leaving','Two','b@example.test'),('Remaining','Three','c@example.test');
    INSERT INTO household(household_name,join_code) VALUES ('Here','HERE'),('Other','THERE');
    INSERT INTO household_member(household_id,user_id,role,joined_date) VALUES (1,1,'owner','2025-01-01'),(1,2,'member','2025-01-01'),(1,3,'member','2025-01-01'),(2,2,'owner','2025-01-01'),(2,3,'member','2025-01-01');
    INSERT INTO payment_method(user_id,app,username) VALUES (2,'venmo','private-handle');
    INSERT INTO expense(household_id,paid_by_user_id,item_name,total_amount,created_at) VALUES (1,1,'Owner purchase',30,'2026-01-01'),(1,2,'Leaving purchase',30,'2026-01-01'),(2,2,'Other purchase',10,'2026-01-01');
    INSERT INTO expense_share(expense_id,user_id,amount_owed) VALUES (1,2,10),(1,3,10),(2,1,10),(2,3,10),(3,3,5);
    INSERT INTO payment(household_id,payer_user_id,payee_user_id,amount,paid_with,status,created_at) VALUES (1,2,1,10,'venmo','sent','2026-02-01');
    UPDATE expense_share SET settled_by_payment_id=1 WHERE expense_id=1 AND user_id=2;
    INSERT INTO chore(household_id,created_by_user_id,chore_name) VALUES (1,2,'Shared chore');
    INSERT INTO chore_rotation(chore_id,user_id,turn_order) VALUES (1,2,0),(1,3,1);
    INSERT INTO chore_assignment(chore_id,assigned_user_id,due_at) VALUES (1,2,now()-interval '1 day'),(1,2,now()+interval '1 day'),(1,3,now()+interval '2 days');
    INSERT INTO bulletin_message(household_id,sender_user_id,message_text,is_pinned) VALUES (1,2,'My old announcement',true);
    INSERT INTO bulletin_message(household_id,sender_user_id,parent_message_id,message_text) VALUES (1,3,1,'Keep my reply');
    INSERT INTO event(household_id,created_by_user_id,event_name,event_date) VALUES (1,2,'Hosted future',now()+interval '1 day');
  `);
});
afterAll(() => pg.close());
const balances = () => getBalances(1,1);
describe('departure lifecycle', () => {
  it('permits self-leaving with unpaid balances, archives obligations and keeps history and other roommates intact',async () => {
    expect((await balances()).incoming).toHaveLength(1);
    await (remove as any)(removeContext(2,2,'member'));
    const result = await balances();
    expect(result.mine).toEqual([{otherUserId:3,signedAmount:'10.00',pendingAmount:'0.00',disputedAmount:'0.00'}]);
    expect(result.pairs.some((p) => p.debtorUserId===2 || p.creditorUserId===2)).toBe(false);
    expect(result.incoming).toEqual([]); expect(result.outgoing).toEqual([]); expect(result.payable).toEqual([]);
    expect(result.paymentMethods[2]).toBeUndefined();
    const history = await listExpenses(1,1);
    expect(history.expenses).toHaveLength(2);
    expect(history.expenses.find((e)=>e.expenseId===1)!.shares.find((s)=>s.userId===2)!.status).toBe('archived');
    expect((await pg.query('SELECT status FROM payment')).rows).toEqual([{status:'sent'}]);
    expect((await pg.query('SELECT assigned_user_id FROM chore_assignment')).rows).toEqual([{assigned_user_id:3}]);
    expect((await pg.query('SELECT created_by_user_id FROM chore')).rows).toEqual([{created_by_user_id:1}]);
    expect((await pg.query('SELECT is_resolved,is_pinned FROM bulletin_message WHERE message_id=1')).rows).toEqual([{is_resolved:true,is_pinned:false}]);
    expect((await pg.query('SELECT message_text FROM bulletin_message WHERE message_id=2')).rows).toEqual([{message_text:'Keep my reply'}]);
    expect((await pg.query('SELECT event_id FROM event')).rows).toEqual([]);
    expect((await getBalances(2,3)).mine).toHaveLength(1);
    const members = await (await (listMembers as any)({householdId:1})).json();
    expect(members.members.find((m:any)=>m.userId===2)).toMatchObject({email:null,phoneNumber:null,paymentMethods:[]});
  });
  it('allows owner removal but rejects removing another member without ownership and owner departure without transfer',async () => {
    await expect((remove as any)(removeContext(3,2,'member'))).rejects.toThrow('owner');
    await expect((remove as any)(removeContext(1,1))).rejects.toThrow('Transfer ownership');
    expect((await pg.query('SELECT left_date FROM household_member WHERE household_id=1 AND user_id=2')).rows).toEqual([{left_date:null}]);
    await (remove as any)(removeContext());
    await expect(createPayment(asUser(3),1,{payeeUserId:2,expenseIds:[2],paidWith:'venmo'})).rejects.toThrow('current roommates');
    await expect(reviewPayment(asUser(1),1,1,{status:'confirmed'})).rejects.toThrow('previous household stay');
  });
  it('rejects stale writes authorized before departure instead of recreating removed activity',async () => {
    await (remove as any)(removeContext());
    await expect(createExpense(asUser(2),1,{itemName:'Late expense',totalAmount:'10.00',participantUserIds:[1]})).rejects.toThrow('currently live');
    await expect(createEvent(asUser(2),1,{eventName:'Late event',category:'meeting',date:'2026-12-01',time:'18:00'})).rejects.toThrow('currently live');
    await expect(postNote(asUser(2),1,{messageText:'Late announcement'})).rejects.toThrow('currently live');
    await expect(createChore(asUser(2),1,{choreName:'Late chore',repeats:'weekly',dayOfWeek:1,dueTime:'12:00',assignment:{mode:'person',userId:3}})).rejects.toThrow('currently live');
    expect((await pg.query('SELECT expense_id FROM expense')).rows).toHaveLength(3);
    expect((await pg.query('SELECT message_id FROM bulletin_message')).rows).toHaveLength(2);
  });
  it('does not revive old debts or payments when someone rejoins, but includes new shared purchases',async () => {
    await (remove as any)(removeContext());
    await (join as any)(asUser(2),new Request('http://localhost/api/households/join',{method:'POST',body:JSON.stringify({joinCode:'HERE'})}));
    expect((await balances()).pairs.some((p)=>p.creditorUserId===2 || p.debtorUserId===2)).toBe(false);
    expect((await balances()).incoming).toEqual([]);
    await expect(createPayment(asUser(3),1,{payeeUserId:2,expenseIds:[2],paidWith:'venmo'})).rejects.toThrow('previous household stay');
    await pg.exec(`INSERT INTO expense(household_id,paid_by_user_id,item_name,total_amount) VALUES (1,1,'New purchase',10); INSERT INTO expense_share(expense_id,user_id,amount_owed) VALUES (4,2,5);`);
    expect((await balances()).mine.find((b)=>b.otherUserId===2)?.signedAmount).toBe('5.00');
  });
});
