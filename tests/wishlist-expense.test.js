// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { inputs } from '../src/lib/events.js';
import '../src/pages/finances.js';

let form, picker;
beforeEach(() => {
  document.body.innerHTML = `<form data-form="expense"><select name="wishlistItemId"><option value="">Not from the wish list</option><option value="1" data-name="Toilet Paper" data-price="13.50">Toilet Paper</option><option value="2" data-name="Trash bags" data-price="">Trash bags</option></select><input name="itemName"><input name="totalAmount"><input name="purchaseDate" value="2026-11-06"><input type="checkbox" name="p" value="2" checked><input type="checkbox" name="p" value="3"><div id="split-preview"></div></form>`;
  form = document.querySelector('form'); picker = form.elements.namedItem('wishlistItemId');
});
describe('expense wish-list selection', () => {
  it('clears the prefilled name, total, and stale split amounts when choosing Not from the wish list', () => {
    picker.value = '1'; inputs['wish-pick'](picker);
    expect(form.elements.namedItem('itemName').value).toBe('Toilet Paper');
    expect(form.elements.namedItem('totalAmount').value).toBe('13.50');
    expect(document.getElementById('split-preview').textContent).toContain('$6.75');
    picker.value = ''; inputs['wish-pick'](picker);
    expect(form.elements.namedItem('itemName').value).toBe('');
    expect(form.elements.namedItem('totalAmount').value).toBe('');
    expect(document.getElementById('split-preview').textContent).toBe('Split 2 ways.');
    expect(form.elements.namedItem('purchaseDate').value).toBe('2026-11-06');
    expect([...form.querySelectorAll('[name=p]')].map((el) => el.checked)).toEqual([true, false]);
  });
  it('clears the previous price when switching to a wish-list item with no estimate', () => {
    picker.value = '1'; inputs['wish-pick'](picker);
    picker.value = '2'; inputs['wish-pick'](picker);
    expect(form.elements.namedItem('itemName').value).toBe('Trash bags');
    expect(form.elements.namedItem('totalAmount').value).toBe('');
    expect(document.getElementById('split-preview').textContent).not.toContain('$');
  });
});
