// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/auth-client.js", () => ({ api: vi.fn() }));
import { api } from "../src/auth-client.js";
import { S } from "../src/lib/state.js";
import { actions, forms, inputs } from "../src/lib/events.js";
import { calendarView } from "../src/pages/calendar.js";
import { settingsView } from "../src/pages/settings.js";
import { connectHomeLayout } from "../src/components/home-layout.js";
import { homeView } from "../src/pages/home.js";
const user = { userId: 1, firstName: "Alex", lastName: "Rivera", profilePhoto: null, phoneNumber: "", paymentMethods: [] };
const members = [user, { userId: 2, firstName: "Jordan" }, { userId: 3, firstName: "Sam" }];
const events = [{ eventId: 1, eventName: "Dinner", eventDate: "2026-11-05T20:00:00Z", endDate: null, createdByUserId: 1, category: "meeting", canEdit: true, tags: [{ userId: 2, response: "pending" }] }];
const chores = { chores: [{ choreId: 1, choreName: "Dishes" }], assignments: [{ assignmentId: 1, choreId: 1, dueAt: "2026-11-05T19:00:00Z", assignedUserId: 3, isCompleted: false }] };
const mockedApi = vi.mocked(api);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(/* @__PURE__ */ new Date("2026-11-05T18:00:00Z"));
  document.body.innerHTML = '<div id="page"></div><div id="toast"></div>';
  S.user = structuredClone(user);
  S.hid = 1;
  S.households = [{ householdId: 1, householdName: "Test household", timezone: "America/Denver" }];
  localStorage.clear();
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path) => {
    if (path.endsWith("/members")) return { members };
    if (path.endsWith("/events")) return { events };
    if (path.endsWith("/chores")) return chores;
    if (path.endsWith("/board")) return { notes: [] };
    if (path.endsWith("/balances")) return { mine: [] };
    throw new Error("Unexpected test route " + path);
  });
});
async function eventForm() {
  document.getElementById("page").innerHTML = await calendarView();
  actions["add-event"]({ dataset: {} });
  return document.querySelector("form[data-form=event-save]");
}
describe("event form", () => {
  it("requires the label only for Other and keeps both times in one row", async () => {
    const form = await eventForm();
    const label = form.elements.namedItem("otherLabel");
    expect(label.closest("label").hidden).toBe(true);
    expect(label.disabled).toBe(true);
    expect(label.required).toBe(false);
    const other = form.querySelector("input[value=other]");
    other.checked = true;
    inputs["event-cat"]();
    expect(label.closest("label").hidden).toBe(false);
    expect(label.required).toBe(true);
    expect(label.disabled).toBe(false);
    form.querySelector("input[value=meeting]").checked = true;
    inputs["event-cat"]();
    expect(label.disabled).toBe(true);
    expect(label.required).toBe(false);
    expect(form.querySelector(".event-time-range [name=time]")).toBeTruthy();
    expect(form.querySelector(".event-time-range [name=endTime]")).toBeTruthy();
    expect(form.querySelector(".event-time-range [name=date]")).toBeNull();
  });
  it("selects all other roommates and reflects partial selections", async () => {
    const form = await eventForm();
    const all = form.querySelector("[data-input=event-select-all]");
    const boxes = [...form.querySelectorAll("input[name=tag]")];
    expect(boxes.map((b) => b.value)).toEqual(["2", "3"]);
    all.checked = true;
    inputs["event-select-all"](all);
    expect(boxes.every((b) => b.checked)).toBe(true);
    boxes[0].checked = false;
    inputs["event-approver"]();
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);
    inputs["event-select-all"](all);
    expect(boxes.some((b) => b.checked)).toBe(false);
    expect(form.textContent).toContain("Pending approval");
  });
});
describe("profile save", () => {
  it("refreshes canonical values and allows saving again without another edit", async () => {
    document.getElementById("page").innerHTML = settingsView();
    const form = document.querySelector("form");
    expect(form.querySelector("[type=submit]").disabled).toBe(false);
    form.elements.namedItem("firstName").value = "  Jordan  ";
    inputs["profile-dirty"]();
    mockedApi.mockResolvedValue({ user: { ...user, firstName: "Jordan", paymentMethods: [{ app: "venmo", username: "@jordan", isPreferred: true }] } });
    const pending = forms.profile(form);
    expect(form.querySelector("button[type=submit]").textContent).toBe("Saving\u2026");
    expect(form.querySelector("button[type=submit]").disabled).toBe(true);
    await pending;
    const refreshed = document.querySelector("form");
    expect(refreshed).not.toBe(form);
    expect(refreshed.elements.namedItem("firstName").value).toBe("Jordan");
    expect(refreshed.elements.namedItem("pay_venmo").value).toBe("@jordan");
    expect(refreshed.querySelector("[type=submit]").disabled).toBe(false);
    expect(document.getElementById("profile-status").textContent).toContain("Profile saved");
    await forms.profile(refreshed);
    expect(mockedApi).toHaveBeenCalledTimes(2);
  });
  it("keeps edits and the save button usable after a failed request", async () => {
    document.getElementById("page").innerHTML = settingsView();
    const form = document.querySelector("form");
    form.elements.namedItem("phoneNumber").value = "123";
    inputs["profile-dirty"]();
    mockedApi.mockRejectedValue(new Error("Could not save. Try again."));
    await forms.profile(form);
    expect(form.elements.namedItem("phoneNumber").value).toBe("123");
    expect(form.querySelector("[type=submit]").disabled).toBe(false);
    expect(form.querySelector(".err").textContent).toContain("Could not save");
  });
});
describe("Home views", () => {
  it("limits the list to one month and keeps month navigation in List view across year boundaries", async () => {
    S.hid = 2; S.households = [{ householdId: 2, householdName: 'Another house', timezone: 'America/Denver' }];
    const baseApi = mockedApi.getMockImplementation();
    mockedApi.mockImplementation((path) => path.endsWith('/events') ? Promise.resolve({ events: [
      ...events,
      { ...events[0], eventId: 2, eventName: 'December plan', eventDate: '2026-12-01T20:00:00Z' },
      { ...events[0], eventId: 3, eventName: 'January plan', eventDate: '2027-01-01T20:00:00Z' },
    ] }) : baseApi(path));
    document.getElementById('page').innerHTML = await homeView();
    const content = document.getElementById('home-schedule-content');
    expect(content.textContent).toContain('November 2026');
    expect(content.textContent).toContain('Dinner');
    expect(content.textContent).not.toContain('December plan');
    const next = () => actions['home-month'](content.querySelector('[data-n="1"]'));
    next();
    expect(content.textContent).toContain('December 2026');
    expect(content.textContent).toContain('December plan');
    expect(content.textContent).not.toContain('Dinner');
    expect(content.textContent).not.toContain('January plan');
    expect(content.querySelector('.home-month')).toBeNull();
    next();
    expect(content.textContent).toContain('January 2027');
    expect(content.textContent).toContain('January plan');
    expect(content.textContent).not.toContain('December plan');
    const picker = document.querySelector('[data-input="home-view"]');
    picker.value = 'calendar'; inputs['home-view'](picker);
    expect(content.textContent).toContain('January 2027');
    expect(content.querySelector('.home-month')).not.toBeNull();
    picker.value = 'list'; inputs['home-view'](picker);
    next();
    expect(content.textContent).toContain('February 2027');
    expect(content.textContent).toContain('No events or chores from today onward in this month.');
    actions['home-month'](content.querySelector('[data-n="-1"]'));
    expect(content.textContent).toContain('January plan');
    expect(mockedApi).toHaveBeenCalledTimes(5);
  });

  it("switches the same household-wide items between list and calendar, with pending approval visible", async () => {
    document.getElementById("page").innerHTML = await homeView();
    expect(document.body.textContent).not.toMatch(/Customize|My chores/);
    expect(document.body.textContent).toContain("Dishes");
    expect(document.body.textContent).toContain("Dinner");
    expect(document.body.textContent).toContain("Pending approval");
    const picker = document.querySelector('[data-input="home-view"]');
    expect([...picker.options].map((option) => option.textContent)).toEqual(['Calendar view', 'List view']);
    expect(picker.closest('.home-schedule')).not.toBeNull();
    expect(document.querySelector('.page-header [data-input=home-view]')).toBeNull();
    picker.value = 'calendar';
    inputs['home-view'](picker);
    expect(picker.value).toBe('calendar');
    const day = document.querySelector('[data-day="2026-11-05"]');
    expect(day.textContent).toContain("Dishes");
    expect(day.textContent).toContain("Dinner");
    expect(day.textContent).toContain("Pending approval");
    actions["home-day"](day);
    expect(document.querySelector("[role=dialog]").textContent).toContain("Sam");
    expect(document.querySelector("[role=dialog]").textContent).toContain("Dinner");
    picker.value = 'list';
    inputs['home-view'](picker);
    expect(document.getElementById("home-schedule-content").textContent.indexOf("Dishes")).toBeLessThan(document.getElementById("home-schedule-content").textContent.indexOf("Dinner"));
    expect(mockedApi).toHaveBeenCalledTimes(5);
  });
});

describe('chore rotation order', () => {
  async function rotationForm() {
    const { choresView } = await import('../src/pages/chores.js');
    const baseApi = mockedApi.getMockImplementation();
    mockedApi.mockImplementation((path) => path.endsWith('/chores') ? Promise.resolve({ chores: [], assignments: [], swapRequests: [] }) : baseApi(path));
    document.getElementById('page').innerHTML = await choresView();
    actions['add-chore']();
    const form = document.querySelector('form[data-form=chore-add]');
    form.elements.namedItem('mode').value = 'rotate'; inputs['chore-who']();
    return form;
  }
  it('moves roommates up/down, preserves selections, and submits the displayed checked order', async () => {
    const form = await rotationForm();
    const list = form.querySelector('.rotation-list');
    expect(list.firstElementChild.querySelector('[data-direction=up]').disabled).toBe(true);
    expect(list.lastElementChild.querySelector('[data-direction=down]').disabled).toBe(true);
    const sam = list.lastElementChild;
    actions['rotation-move'](sam.querySelector('[data-direction=up]'));
    actions['rotation-move'](sam.querySelector('[data-direction=up]'));
    expect([...new FormData(form).getAll('rot')]).toEqual(['3', '1', '2']);
    form.querySelector('[name=rot][value="1"]').checked = false;
    actions['rotation-move'](sam.querySelector('[data-direction=down]'));
    expect(form.querySelector('[name=rot][value="1"]').checked).toBe(false);
    expect([...new FormData(form).getAll('rot')]).toEqual(['3', '2']);
    form.elements.namedItem('choreName').value = 'Take out trash';
    mockedApi.mockResolvedValue({ occurrences: 2 });
    await forms['chore-add'](form);
    expect(mockedApi.mock.calls.at(-1)[1].body.assignment).toEqual({ mode: 'rotate', userIds: [3, 2] });
  });
  it('drags a roommate into a new position without changing who is selected', async () => {
    const form = await rotationForm();
    const list = form.querySelector('.rotation-list');
    const sam = list.lastElementChild, alex = list.firstElementChild;
    const transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    const drag = (target, type) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { dataTransfer: { value: transfer }, clientY: { value: 0 } });
      target.dispatchEvent(event);
      return event;
    };
    drag(sam.querySelector('[data-rotation-drag]'), 'dragstart');
    expect(transfer.setData).toHaveBeenCalledWith('text/plain', '3');
    expect(drag(alex, 'dragover').defaultPrevented).toBe(true);
    drag(alex, 'drop');
    expect([...new FormData(form).getAll('rot')]).toEqual(['3', '1', '2']);
    expect(list.querySelector('.dragging,.drag-target')).toBeNull();
    expect(document.getElementById('rotation-status').textContent).toContain('position 1 of 3');
  });
});

describe('Home household board', () => {
  const assignment = { assignmentId: 20, choreId: 5, assignedUserId: 2, dueAt: '2026-11-16T14:00:00Z', isCompleted: false };
  const request = { swapId: 7, type: 'skip', requesterAssignmentId: 20, targetAssignmentId: null, requesterUserId: 2, targetUserId: null, requestMessage: 'Visiting family' };
  let boardChores, boardEvents, notes;
  async function renderBoard() {
    boardChores = { chores: [{ choreId: 5, choreName: 'Laundry', repeats: 'weekly', effort: 'medium', rotation: [1, 2], schedule: 'Every Monday', description: 'Wash, dry, and fold the laundry.' }], assignments: [assignment], swapRequests: [request] };
    boardEvents = [{ ...events[0], eventId: 9, createdByUserId: 2, tags: [{ userId: 1, response: 'pending' }] }];
    notes = [{ messageId: 8, senderUserId: 2, messageText: 'Same announcement as Events', postedDate: '2026-11-05T17:00:00Z', isPinned: true, replies: [] }];
    mockedApi.mockImplementation(async (path, options = {}) => {
      if (options.method) return {};
      if (path.endsWith('/members')) return { members };
      if (path.endsWith('/events')) return { events: boardEvents };
      if (path.endsWith('/chores')) return boardChores;
      if (path.endsWith('/balances')) return { mine: [] };
      if (path.endsWith('/board')) return { notes };
      throw new Error('Unexpected path ' + path);
    });
    document.getElementById('page').innerHTML = await homeView();
  }
  it('shows actionable requests and the same announcements, without granting unrelated swap controls', async () => {
    await renderBoard();
    const board = document.getElementById('home-board');
    expect(board.textContent).toContain('Jordan needs someone to cover Laundry');
    expect(board.textContent).toContain('View chore');
    expect(board.textContent).toContain('Same announcement as Events');
    expect(board.querySelector('.home-board-columns')).toBeNull();
    expect(board.textContent).not.toMatch(/Needs your response|Your requests/);
    expect(board.querySelector('[aria-label="Household announcements and requests"] article')).not.toBeNull();
    expect(board.querySelector('[data-kind=event][data-response=accepted]')).not.toBeNull();
    boardChores.swapRequests = [{ ...request, type: 'swap', targetUserId: 3 }];
    document.getElementById('page').innerHTML = await homeView();
    expect(document.querySelector('#home-board [data-kind=chore]')).toBeNull();
  });
  it('shows the same cover request on both Chores views with a working response control', async () => {
    await renderBoard();
    const { choresView } = await import('../src/pages/chores.js');
    document.getElementById('page').innerHTML = await choresView();
    const board = document.querySelector('.chore-requests-board');
    expect(board.textContent).toContain('Cover Requests');
    expect(board.textContent).toContain('Cover request');
    expect(board.textContent).toContain('Wash, dry, and fold the laundry.');
    expect(board.querySelector('.chore-occurrence').textContent).toContain('Jordan');
    expect(board.querySelector('.chore-occurrence').textContent).toContain('Mon Nov 16');
    expect(board.textContent).toContain('Laundry');
    expect(board.querySelector('[data-action=open-request]').dataset.id).toBe('7');
    actions['open-request'](board.querySelector('[data-action=open-request]'));
    expect(document.querySelector('[role=dialog]').textContent).toContain('Wash, dry, and fold the laundry.');
    expect(document.querySelector('[role=dialog] h3').textContent).toBe('Laundry');
    expect(document.querySelector('[role=dialog]').textContent).toContain('Cover it');
    expect(document.querySelector('[role=dialog]').textContent).toContain('Decline');
    expect(document.querySelector('form[data-form=respond]').dataset.id).toBe('7');
    actions['chore-tab']({ dataset: { value: 'chart' } });
    document.getElementById('page').innerHTML = await choresView();
    expect(document.querySelectorAll('.chore-requests-board')).toHaveLength(1);
    expect(document.querySelector('.chore-requests-board').textContent).toContain('Laundry');
    actions['chore-tab']({ dataset: { value: 'schedule' } });
  });
  it('keeps Cover Requests empty when only swaps are open and still exposes those swaps', async () => {
    await renderBoard();
    boardChores = { ...boardChores, swapRequests: [{ ...request, type: 'swap', targetUserId: 1 }] };
    const { choresView } = await import('../src/pages/chores.js');
    document.getElementById('page').innerHTML = await choresView();
    expect(document.querySelector('.chore-requests-board h2').textContent).toBe('Cover Requests');
    expect(document.querySelector('.chore-requests-board').textContent).toContain('No chores need to be covered.');
    expect(document.querySelector('.chore-swap-board').textContent).toContain('Laundry');
  });
  it('shows reply photos and opens roommate profiles on Home and Events without visiting Household first', async () => {
    await renderBoard();
    notes[0].replies = [{ messageId: 11, senderUserId: 3, messageText: 'Sounds good', postedDate: '2026-11-05T17:30:00Z' }];
    const baseApi = mockedApi.getMockImplementation();
    mockedApi.mockImplementation((path, options) => path.endsWith('/members') ? Promise.resolve({ members: members.map((m) => m.userId === 3 ? { ...m, profilePhoto: 'https://images.example/sam.jpg', email: 'sam@example.test' } : m) }) : baseApi(path, options));
    for (const page of [homeView, calendarView]) {
      document.getElementById('page').innerHTML = await page();
      const reply = document.querySelector('.reply');
      expect(reply.textContent).toContain('Sam');
      expect(reply.querySelector('img').getAttribute('src')).toBe('https://images.example/sam.jpg');
      const profile = reply.querySelector('[data-action=board-roommate-profile]');
      expect(profile.getAttribute('aria-label')).toContain('Sam');
      const before = mockedApi.mock.calls.length;
      await actions['board-roommate-profile'](profile);
      expect(mockedApi.mock.calls[before][0]).toBe('/households/1/members');
      expect(document.querySelector('[role=dialog]').textContent).toContain('sam@example.test');
      document.getElementById('modal').remove();
    }
  });
  it('keeps former-roommate contact and payment details hidden when opened from a comment', async () => {
    await renderBoard();
    notes[0].replies = [{ messageId: 11, senderUserId: 3, messageText: 'Earlier reply', postedDate: '2026-11-05T17:30:00Z' }];
    document.getElementById('page').innerHTML = await homeView();
    mockedApi.mockResolvedValueOnce({ members: [{ userId: 3, firstName: 'Sam', leftDate: '2026-11-01', email: 'hidden@example.test', paymentMethods: [{ app: 'venmo', username: '@hidden' }] }] });
    await actions['board-roommate-profile'](document.querySelector('.reply [data-action=board-roommate-profile]'));
    const profile = document.querySelector('[role=dialog]');
    expect(profile.textContent).toContain('Contact details are hidden for former roommates');
    expect(profile.textContent).not.toContain('hidden@example.test');
    expect(profile.textContent).not.toContain('@hidden');
  });
  it('opens the exact chore details from Home and submits coverage from the standard popup', async () => {
    await renderBoard();
    const button = document.querySelector('[data-action=home-chore-detail]');
    expect(button.dataset.id).toBe('20');
    await actions['home-chore-detail'](button);
    const modal = document.querySelector('[role=dialog]');
    expect(modal.querySelector('h3').textContent).toBe('Laundry');
    expect(modal.textContent).toContain('Wash, dry, and fold the laundry.');
    expect(modal.textContent).toContain('Every Monday');
    expect(modal.textContent).toContain('Mon Nov 16');
    expect(modal.textContent).toContain('Visiting family');
    const form = modal.querySelector('form[data-form=respond]');
    expect(form.querySelector('[type=submit]').textContent).toBe('Cover it');
    expect(form.querySelector('[data-answer=decline]').textContent).toBe('Decline');
    await forms.respond(form);
    expect(mockedApi).toHaveBeenCalledWith('/households/1/swap-requests/7', { method: 'PATCH', body: { action: 'accept', message: undefined } });
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('uses Decline for a cover response and keeps the full details on a failed submission', async () => {
    await renderBoard();
    await actions['home-chore-detail'](document.querySelector('[data-action=home-chore-detail]'));
    const form = document.querySelector('form[data-form=respond]');
    form.elements.namedItem('message').value = 'I am away';
    mockedApi.mockRejectedValueOnce(new Error('Please try again'));
    await forms.respond(form);
    expect(form.querySelector('.err').textContent).toBe('Please try again');
    expect(document.querySelector('[role=dialog]').textContent).toContain('Wash, dry, and fold the laundry.');
    expect(form.elements.namedItem('message').value).toBe('I am away');
    await actions.answer(form.querySelector('[data-answer=decline]'));
    expect(mockedApi).toHaveBeenLastCalledWith('/households/1/swap-requests/7', { method: 'PATCH', body: { action: 'decline', message: 'I am away' } });
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('lets a requester see and cancel their own request, without offering to cover it themselves', async () => {
    await renderBoard();
    boardChores = { ...boardChores, swapRequests: [{ ...request, requesterUserId: 1 }] };
    document.getElementById('page').innerHTML = await homeView();
    expect(document.getElementById('home-board').textContent).toContain('Waiting for a volunteer');
    expect(document.querySelector('[data-kind=chore][data-response=accept]')).toBeNull();
    await actions['home-board-response'](document.querySelector('[data-kind=chore][data-response=withdraw]'));
    expect(mockedApi).toHaveBeenCalledWith('/households/1/swap-requests/7', { method: 'PATCH', body: { action: 'withdraw' } });
  });
  it('submits event approval without duplicating an event or a board post', async () => {
    await renderBoard();
    boardEvents = [];
    await actions['home-board-response'](document.querySelector('[data-kind=event][data-response=accepted]'));
    const writes = mockedApi.mock.calls.filter(([, options]) => options?.method);
    expect(writes).toEqual([['/households/1/events/9/respond', { method: 'POST', body: { response: 'accepted' } }]]);
  });
  it('keeps a failed response visible and retryable', async () => {
    await renderBoard();
    const button = document.querySelector('[data-kind=event][data-response=accepted]');
    mockedApi.mockRejectedValueOnce(new Error('Connection lost'));
    await actions['home-board-response'](button);
    expect(button.disabled).toBe(false);
    expect(button.closest('article').querySelector('.err').textContent).toBe('Connection lost');
  });
  it('posts and replies to the existing shared board records', async () => {
    await renderBoard();
    expect(document.querySelector('[data-form=home-note-new]')).toBeNull();
    expect(document.querySelector('[data-action=home-make-announcement]')).not.toBeNull();
    actions['home-make-announcement']();
    const form = document.querySelector('[data-form=home-note-new]');
    expect(form.closest('[role=dialog]')).not.toBeNull();
    expect(form.elements.namedItem('eventId')).not.toBeNull();
    form.elements.namedItem('messageText').value = 'Pizza tonight';
    notes = [...notes, { messageId: 10, senderUserId: 1, messageText: 'Pizza tonight', postedDate: '2026-11-05T18:00:00Z', replies: [] }];
    await forms['home-note-new'](form);
    expect(mockedApi).toHaveBeenCalledWith('/households/1/board', { method: 'POST', body: { messageText: 'Pizza tonight' } });
    expect(document.getElementById('home-board').textContent).toContain('Pizza tonight');
    expect(document.querySelector('[role=dialog]')).toBeNull();
    const reply = document.querySelector('[data-form=home-note-reply][data-id="8"]');
    reply.elements.namedItem('messageText').value = 'Sounds good';
    await forms['home-note-reply'](reply);
    expect(mockedApi).toHaveBeenCalledWith('/households/1/board', { method: 'POST', body: { messageText: 'Sounds good', parentMessageId: 8 } });
  });
});


describe('Home widget customization', () => {
  const layoutKey = 'roomie.home.layout.1.1';
  const render = async () => { document.getElementById('page').innerHTML = await homeView(); };
  it('saves size and order per user and household, independently of Calendar/List', async () => {
    await render();
    actions['home-edit-layout'](document.querySelector('[data-action="home-edit-layout"]'));
    actions['home-widget-move']({ dataset: { widget: 'schedule', step: '1' } });
    const view = document.querySelector('[data-input="home-view"]');
    view.value = 'calendar'; inputs['home-view'](view);
    const day = document.querySelector('[data-day="2026-11-05"]');
    expect(day.querySelectorAll('.home-day-dots i')).toHaveLength(2);
    expect(day.querySelector('.home-calendar-item')).toBeNull();
    expect(document.querySelector('.home-compact-upcoming').textContent).toContain('Dinner');
    actions['home-day'](day);
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Dishes');
    document.getElementById('modal')?.remove();
    actions['home-widget-move']({ dataset: { widget: 'finances', step: '-1' } });
    expect(JSON.parse(localStorage.getItem(layoutKey)).map((w) => w.id)).toEqual(['board', 'finances', 'schedule']);
    await render();
    expect(document.querySelector('.home-widget').classList.contains('compact')).toBe(true);
    expect(document.querySelector('[data-input="home-view"]').value).toBe('calendar');
    actions['home-month'](document.querySelector('[data-n="1"]'));
    expect(document.querySelector('#home-schedule-content').textContent).toContain('December 2026');
    S.user = { ...S.user, userId: 2 };
    await render();
    expect(document.querySelector('.home-widget').classList.contains('expanded')).toBe(true);
    expect(document.querySelector('[data-input="home-view"]').value).toBe('list');
  });
  it('falls back from invalid preferences and keeps board reply drafts when resizing or moving', async () => {
    localStorage.setItem(layoutKey, JSON.stringify([{ id: 'bad', size: 'giant' }]));
    const baseApi = mockedApi.getMockImplementation();
    mockedApi.mockImplementation((path) => path.endsWith('/board') ? Promise.resolve({ notes: [{ messageId: 77, senderUserId: 2, messageText: 'House meeting', postedDate: '2026-11-05T17:00:00Z', replies: [] }] }) : baseApi(path));
    await render();
    expect(document.querySelectorAll('.home-widget')).toHaveLength(3);
    const summary = document.querySelector('[data-board-entry="note-77"] summary');
    expect(summary.textContent).toContain('House meeting');
    const input = document.querySelector('#home-board input[name="messageText"]');
    input.value = 'Keep my reply';
    actions['home-widget-move']({ dataset: { widget: 'board', step: '-1' } });
    expect(document.querySelector('.home-board-summary')).toBeNull();
    expect(document.querySelector('#home-board input').value).toBe('Keep my reply');
    actions['home-widget-move']({ dataset: { widget: 'board', step: '2' } });
    expect(document.querySelector('#home-board input').value).toBe('Keep my reply');
    actions['home-widget-move']({ dataset: { widget: 'board', step: '-2' } });
    expect(document.querySelector('.home-widget').dataset.widget).toBe('board');
    expect(document.querySelector('#home-board input').value).toBe('Keep my reply');
  });
});

describe('Home live dragging', () => {
  const order = () => [...document.querySelectorAll('.home-dashboard>.home-widget')].map((el) => el.dataset.widget);
  const point = (target, type, x = 10, y = 100) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 42 });
    target.dispatchEvent(event);
  };
  async function setup() {
    document.getElementById('page').innerHTML = await homeView();
    connectHomeLayout();
    const edit = document.querySelector('[data-action="home-edit-layout"]');
    if (edit.textContent === 'Edit dashboard') actions['home-edit-layout'](edit);
    return document.querySelector('[data-widget-drag="schedule"]');
  }
  it('previews surrounding reordering before release, then saves without replacing widget content', async () => {
    const grip = await setup();
    const board = document.getElementById('home-board');
    const target = document.querySelector('.home-widget[data-widget="finances"]');
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
    expect(document.querySelector('[data-action="home-widget-move"]')).toBeNull();
    point(grip, 'pointerdown');
    point(document, 'pointermove', 100, 110);
    expect(order()).toEqual(['board', 'finances', 'schedule']);
    expect(localStorage.getItem('roomie.home.layout.1.1')).toBeNull();
    expect(document.querySelector('.home-widget-ghost').getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById('home-board')).toBe(board);
    point(document, 'pointerup', 100, 110);
    expect(JSON.parse(localStorage.getItem('roomie.home.layout.1.1')).map((w) => w.id)).toEqual(order());
    expect(document.querySelector('.home-widget-ghost')).toBeNull();
    expect(document.querySelector('.home-widget-dragging')).toBeNull();
  });
  it('automatically changes presentation to fit the drop space and rolls the size back on cancellation', async () => {
    let grip = await setup();
    const grid = document.querySelector('.home-dashboard');
    grid.style.gridTemplateColumns = '300px 300px 300px'; grid.style.gridAutoRows = '2px';
    grid.getBoundingClientRect = () => ({ left: 0, right: 900, width: 900, top: 0, bottom: 1000 });
    const rects = { schedule: { left: 0, right: 600, top: 0, bottom: 900, width: 600, height: 900 }, board: { left: 600, right: 900, top: 0, bottom: 300, width: 300, height: 300 }, finances: { left: 600, right: 900, top: 320, bottom: 500, width: 300, height: 180 } };
    [...grid.children].forEach((el) => { el.getBoundingClientRect = () => rects[el.dataset.widget]; });
    const target = grid.querySelector('[data-widget="board"]');
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
    expect(document.querySelector('[data-input="home-widget-size"]')).toBeNull();
    point(grip, 'pointerdown'); point(document, 'pointermove', 800, 100);
    const widget = grid.querySelector('[data-widget="schedule"]');
    expect(widget.classList.contains('compact')).toBe(true);
    expect(widget.dataset.column).toBe('3');
    expect(document.querySelector('.home-widget-ghost').classList.contains('compact')).toBe(true);
    point(document, 'pointercancel');
    expect(widget.classList.contains('expanded')).toBe(true);
    expect(widget.dataset.column).toBe('');
    grip = document.querySelector('[data-widget-drag="schedule"]');
    point(grip, 'pointerdown'); point(document, 'pointermove', 800, 100); point(document, 'pointerup');
    expect(JSON.parse(localStorage.getItem('roomie.home.layout.1.1')).find((w) => w.id === 'schedule')).toMatchObject({ size: 'compact', column: 3 });
  });
  it('restores the original order on Escape or pointer cancellation and supports keyboard movement', async () => {
    let grip = await setup();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.querySelector('.home-widget[data-widget="finances"]') });
    point(grip, 'pointerdown'); point(document, 'pointermove', 100, 110);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(order()).toEqual(['schedule', 'board', 'finances']);
    expect(localStorage.getItem('roomie.home.layout.1.1')).toBeNull();
    grip = document.querySelector('[data-widget-drag="schedule"]');
    point(grip, 'pointerdown'); point(document, 'pointermove', 100, 110); point(document, 'pointercancel');
    grip = document.querySelector('[data-widget-drag="schedule"]');
    expect(order()).toEqual(['schedule', 'board', 'finances']);
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(order()).toEqual(['board', 'schedule', 'finances']);
    expect(document.activeElement.dataset.widgetDrag).toBe('schedule');
  });
});


describe('Home upcoming list dates', () => {
  it('hides previous household-local days in compact, expanded and View all, while calendar history stays accessible', async () => {
    S.hid = 51; S.households = [{ ...S.households[0], householdId: 51 }];
    // UTC has crossed midnight; Denver is still on November 5.
    vi.setSystemTime(new Date('2026-11-06T03:00:00Z'));
    const baseApi = mockedApi.getMockImplementation();
    mockedApi.mockImplementation((path) => {
      if (path.endsWith('/events')) return Promise.resolve({ events: [
        ...events,
        { ...events[0], eventId: 99, eventName: 'Yesterday meeting', eventDate: '2026-11-04T20:00:00Z' },
        ...Array.from({ length: 6 }, (_, i) => ({ ...events[0], eventId: 10 + i, eventName: `Future plan ${i}`, eventDate: `2026-11-${String(6 + i).padStart(2, '0')}T20:00:00Z` })),
      ] });
      if (path.endsWith('/chores')) return Promise.resolve({ ...chores, assignments: [...chores.assignments, { ...chores.assignments[0], assignmentId: 99, dueAt: '2026-11-04T19:00:00Z' }] });
      return baseApi(path);
    });
    localStorage.setItem('roomie.home.layout.1.51', JSON.stringify([{ id: 'schedule', size: 'compact' }, { id: 'board', size: 'compact' }, { id: 'finances', size: 'compact' }]));
    document.getElementById('page').innerHTML = await homeView();
    let content = document.getElementById('home-schedule-content');
    expect(content.textContent).toContain('Dinner');
    expect(content.textContent).not.toContain('Yesterday meeting');
    expect(content.querySelectorAll('.home-schedule-row')).toHaveLength(5);
    const all = content.querySelector('[data-action="home-month-list"]');
    expect(all.textContent).toBe('View all 8 items');
    actions['home-month-list']();
    expect(document.querySelector('[role="dialog"]').textContent).not.toContain('Yesterday meeting');
    expect(document.querySelectorAll('[role="dialog"] .home-schedule-row')).toHaveLength(8);
    document.getElementById('modal')?.remove();
    localStorage.removeItem('roomie.home.layout.1.51');
    document.getElementById('page').innerHTML = await homeView();
    content = document.getElementById('home-schedule-content');
    expect(content.querySelectorAll('.home-schedule-row')).toHaveLength(8);
    const view = content.querySelector('[data-input="home-view"]'); view.value = 'calendar'; inputs['home-view'](view);
    expect(content.querySelector('[data-day="2026-11-04"]').textContent).toContain('Yesterday meeting');
  });
});


it('uses existing card headings for editing, without grip bars or repeated widget labels', async () => {
  document.getElementById('page').innerHTML = await homeView();
  const edit = document.querySelector('[data-action="home-edit-layout"]');
  if (edit.textContent === 'Done') actions['home-edit-layout'](edit);
  expect(document.querySelector('[data-widget-drag]')).toBeNull();
  actions['home-edit-layout'](edit);
  expect(document.querySelector('.home-widget-tools')).toBeNull();
  expect(document.querySelector('.home-drag-handle')).toBeNull();
  const headings = [...document.querySelectorAll('.home-dashboard [data-widget-drag]')];
  expect(headings).toHaveLength(3);
  expect(headings.every((el) => el.tagName === 'H2' && el.tabIndex === 0)).toBe(true);
  actions['home-edit-layout'](edit);
  expect(document.querySelector('[data-widget-drag]')).toBeNull();
});
