// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { homeFinances } from '../src/components/home-finances.js';
const members = Array.from({length:9}, (_, index) => ({userId:index+1,firstName:`Roommate ${index+1}`}));
const render = (balances, compact=false) => { const root=document.createElement('div');root.innerHTML=homeFinances({balances,members,compact});return root; };
describe('expanded Home finances', () => {
  it('groups balances by direction, keeps exact totals and bounds each preview with access to all records', () => {
    const mine=Array.from({length:8}, (_, i) => ({otherUserId:i+1,signedAmount:i<4?'-1.01':'2.02',pendingAmount:'0.00'}));
    const incoming=Array.from({length:5},(_, i)=>({payerUserId:i+1,amount:'3.00',status:i===0?'disputed':'sent',items:[{itemName:'Dinner <script>bad()</script>'}]}));
    const root=render({mine,incoming});
    expect(root.querySelector('.home-balance').textContent).toContain('$4.04');
    expect(root.querySelector('.home-balance').textContent).toContain('$8.08');
    expect([...root.querySelectorAll('.home-finance-group')].map(group=>group.querySelectorAll('.home-finance-person').length)).toEqual([3,3,3]);
    expect(root.querySelector('.home-finance-waiting').textContent).toContain('Payment disputed');
    expect(root.textContent).toContain('Review all payments (5)');
    expect(root.querySelectorAll('a').length).toBe(4);
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<script>bad()</script>');
  });
  it('keeps compact mode to totals and shows clear empty states in expanded mode', () => {
    const compact=render({mine:[],incoming:[]},true);
    expect(compact.querySelector('.home-finance-group')).toBeNull();
    expect(compact.querySelectorAll('.home-balance b')).toHaveLength(2);
    const expanded=render({mine:[],incoming:[]});
    expect(expanded.textContent).toContain('You don’t owe anyone.');
    expect(expanded.textContent).toContain('No one owes you.');
    expect(expanded.textContent).toContain('No payments need your confirmation.');
  });
});
