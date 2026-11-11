import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import { removeFutureMemberActivity } from '../api/_lib/member-cleanup.js';

// Real PostgreSQL constraints and cascades in an isolated in-memory database. No hosted DB access.
const pg = new PGlite();
const dialect = new PgDialect();
const tx = { execute: async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
  const { sql, params } = dialect.sqlToQuery(query);
  return pg.query(sql, params);
} } as Parameters<typeof removeFutureMemberActivity>[0];
const rows = async (sql: string) => (await pg.query(sql)).rows;
beforeAll(async () => {
  await pg.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pg.exec(`
    INSERT INTO users (user_id,first_name,last_name,email) OVERRIDING SYSTEM VALUE VALUES (1,'Owner','One','a@example.test'),(2,'Departing','Two','b@example.test'),(3,'Remaining','Three','c@example.test');
    INSERT INTO household (household_id,household_name,join_code) OVERRIDING SYSTEM VALUE VALUES (1,'Here','HERE'),(2,'Other','THERE');
    INSERT INTO household_member(household_id,user_id,role) VALUES (1,1,'owner'),(1,2,'member'),(1,3,'member'),(2,2,'owner'),(2,3,'member');
    INSERT INTO chore(chore_id,household_id,chore_name) OVERRIDING SYSTEM VALUE VALUES (1,1,'Shared'),(2,2,'Other household'),(3,1,'Solo');
    INSERT INTO chore_rotation(chore_id,user_id,turn_order) VALUES (1,2,0),(1,3,1),(2,2,0),(3,2,0);
    INSERT INTO chore_assignment(assignment_id,chore_id,assigned_user_id,due_at,is_completed,completed_at) OVERRIDING SYSTEM VALUE VALUES
      (1,1,2,now()+interval '1 day',false,null),(2,1,3,now()+interval '2 days',false,null),
      (3,1,2,now()-interval '1 day',false,null),(4,1,2,now()-interval '2 days',true,now()-interval '1 day'),
      (5,2,2,now()+interval '1 day',false,null),(6,3,2,now()+interval '1 day',false,null),
      (7,1,2,now()+interval '3 days',true,now());
    INSERT INTO chore_swap_request(swap_id,requester_assignment_id,target_assignment_id,type) OVERRIDING SYSTEM VALUE VALUES
      (1,1,null,'skip'),(2,2,3,'swap'),(3,5,null,'skip');
    INSERT INTO event(event_id,household_id,created_by_user_id,event_name,event_date) OVERRIDING SYSTEM VALUE VALUES
      (1,1,2,'Future hosted',now()+interval '1 day'),(2,1,2,'Past hosted',now()-interval '1 day'),
      (3,1,3,'Other host',now()+interval '1 day'),(4,2,2,'Other house event',now()+interval '1 day');
    INSERT INTO event_tag(event_id,user_id,response) VALUES (1,3,'pending'),(2,3,'accepted'),(3,2,'pending'),(3,1,'accepted'),(4,3,'pending');
    INSERT INTO bulletin_message(household_id,sender_user_id,event_id,message_text) VALUES (1,2,1,'Keep this announcement');
    INSERT INTO notification(household_id,user_id,section,source_type,source_id,message) VALUES
      (1,3,'chores','chore_swap_request',1,'Cover?'),(1,3,'chores','chore_swap_request',2,'Swap?'),
      (2,3,'chores','chore_swap_request',3,'Other house'),(1,3,'calendar_board','event',1,'Approve?');
    INSERT INTO email_outbox(household_id,user_id,kind,source_type,source_id) VALUES
      (1,3,'approval_request','event',1),(2,3,'approval_request','event',4),(1,2,'approval_request','event',3);
    INSERT INTO expense(household_id,paid_by_user_id,item_name,total_amount) VALUES (1,2,'Past purchase',12.00);
    INSERT INTO expense_share(expense_id,user_id,amount_owed) VALUES (1,3,6.00);
  `);
}, 20000);
afterAll(() => pg.close());

describe('departing roommate cleanup', () => {
  it('rolls back all cleanup together when the enclosing removal transaction fails', async () => {
    await pg.exec('BEGIN');
    await removeFutureMemberActivity(tx, 1, 2);
    await pg.exec('ROLLBACK');
    expect((await rows('SELECT assignment_id FROM chore_assignment')).length).toBe(7);
    expect((await rows('SELECT event_id FROM event')).length).toBe(4);
    expect((await rows('SELECT user_id FROM chore_rotation')).length).toBe(4);
  });
  it('removes only future incomplete assignments, rotations and hosted events in the selected household', async () => {
    await pg.exec('BEGIN');
    await removeFutureMemberActivity(tx, 1, 2);
    await pg.exec('COMMIT');
    expect((await rows('SELECT assignment_id FROM chore_assignment ORDER BY assignment_id')).map((r: any) => Number(r.assignment_id))).toEqual([2,3,4,5,7]);
    expect(await rows('SELECT chore_id,user_id FROM chore_rotation ORDER BY chore_id')).toEqual([{chore_id:1,user_id:3},{chore_id:2,user_id:2}]);
    expect((await rows('SELECT event_id FROM event ORDER BY event_id')).map((r: any) => Number(r.event_id))).toEqual([2,3,4]);
    expect(await rows('SELECT user_id FROM event_tag WHERE event_id=3')).toEqual([{user_id:1}]);
    expect(await rows('SELECT event_id,message_text FROM bulletin_message')).toEqual([{event_id:null,message_text:'Keep this announcement'}]);
    expect(await rows('SELECT status FROM chore_swap_request WHERE swap_id=2')).toEqual([{status:'declined'}]);
    expect(await rows('SELECT is_read FROM notification ORDER BY notification_id')).toEqual([{is_read:true},{is_read:true},{is_read:false},{is_read:true}]);
    expect(await rows('SELECT status FROM email_outbox ORDER BY email_id')).toEqual([{status:'skipped'},{status:'pending'},{status:'skipped'}]);
    expect(await rows('SELECT total_amount FROM expense')).toEqual([{total_amount:'12.00'}]);
    expect(await rows('SELECT amount_owed FROM expense_share')).toEqual([{amount_owed:'6.00'}]);
  });
  it('is safe to repeat without erasing history or another household’s records', async () => {
    await removeFutureMemberActivity(tx, 1, 2);
    expect((await rows('SELECT assignment_id FROM chore_assignment')).length).toBe(5);
    expect(await rows('SELECT status FROM chore_swap_request WHERE swap_id=3')).toEqual([{status:'pending'}]);
  });
});
