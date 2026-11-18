// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { avatar, itemColor } from '../src/lib/dom.js';
import { householdBoard } from '../src/components/household-board.js';
const data={members:[{userId:1,firstName:'One'},{userId:2,firstName:'Two'}],user:{userId:1},timezone:'America/Denver',chores:{chores:[],assignments:[],swapRequests:[]},events:[{eventId:1,eventName:'Plan',createdByUserId:2,eventDate:'2099-01-01T18:00:00Z',tags:[]}],notes:[{messageId:1,senderUserId:1,messageText:'Standalone',postedDate:'2026-11-01',replies:[]},{messageId:2,senderUserId:2,eventId:1,messageText:'Linked',postedDate:'2026-11-01',replies:[]}]};
describe('item type colors',()=>{
  it('gives types distinct colors and removes person-specific avatar backgrounds',()=>{
    expect(new Set(['event','chore','finance','announcement'].map(itemColor)).size).toBe(4);
    const root=document.createElement('div');root.innerHTML=avatar(data.members[0])+avatar(data.members[1]);
    expect([...root.querySelectorAll('.av')].map(el=>el.style.background)).toEqual(['','']);
  });
  it.each([false,true])('uses event color for linked announcements and announcement color for standalone posts in compact=%s',compact=>{
    const root=document.createElement('div');root.innerHTML=householdBoard({...data,compact});
    const posts=[...root.querySelectorAll('.sticky')];
    expect(posts.find(el=>el.textContent.includes('Standalone')).dataset.itemKind).toBe('announcement');
    expect(posts.find(el=>el.textContent.includes('Linked')).dataset.itemKind).toBe('event');
    if(compact)expect(posts.find(el=>el.textContent.includes('Linked')).closest('details').dataset.itemKind).toBe('event');
  });
});
