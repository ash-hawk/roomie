// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { monthCalendar } from '../src/components/month-calendar.js';
const options={month:'2026-08-01',today:'2026-08-01',action:'day-detail',dayLabel:day=>day};
describe('shared feature calendar',()=>{
 it('renders a complete six-week month, two entry previews and access to overflow',()=>{
  const items=Array.from({length:5},(_,i)=>({day:'2026-08-31',title:`Plan ${i}`,time:'6:00 PM',person:'Alex',kind:'event',status:'Pending approval'}));
  const root=document.createElement('div');root.innerHTML=monthCalendar({...options,items});
  expect(root.querySelectorAll('[data-day]')).toHaveLength(42);
  const day=root.querySelector('[data-day="2026-08-31"]');
  expect(day.querySelectorAll('.schedule-calendar-item')).toHaveLength(2);
  expect(day.textContent).toContain('+3 more');
  expect(day.dataset.action).toBe('day-detail');
  expect(day.querySelector('.calendar-status').textContent).toBe('Pending approval');
 });
 it('escapes item details and preserves completed state',()=>{
  const root=document.createElement('div');root.innerHTML=monthCalendar({...options,items:[{day:'2026-08-01',kind:'chore',title:'<script>test()</script>',person:'"onmouseover=x',time:'8:00 AM',completed:true}]});
  expect(root.querySelector('script')).toBeNull();
  expect(root.querySelector('.schedule-calendar-item.completed')).not.toBeNull();
  expect(root.querySelector('[aria-current=date]')).not.toBeNull();
 });
});
