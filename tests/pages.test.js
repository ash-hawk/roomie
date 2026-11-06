// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/auth-client.js", () => ({ api: vi.fn() }));
import { api } from "../src/auth-client.js";
import { S } from "../src/lib/state.js";
import { actions, forms, inputs } from "../src/lib/events.js";
import { calendarView } from "../src/pages/calendar.js";
import { settingsView } from "../src/pages/settings.js";
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
    expect(content.textContent).toContain('No events or chores this month.');
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
    expect(board.querySelector('[aria-label="Household announcements and requests"] > article')).not.toBeNull();
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
