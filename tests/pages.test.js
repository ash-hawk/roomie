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
    expect(mockedApi).toHaveBeenCalledTimes(4);
  });

  it("switches the same household-wide items between list and calendar, with pending approval visible", async () => {
    document.getElementById("page").innerHTML = await homeView();
    expect(document.body.textContent).not.toMatch(/Customize|My chores/);
    expect(document.body.textContent).toContain("Dishes");
    expect(document.body.textContent).toContain("Dinner");
    expect(document.body.textContent).toContain("Pending approval");
    const picker = document.querySelector('[data-input="home-view"]');
    expect([...picker.options].map((option) => option.textContent)).toEqual(['Calendar view', 'List view']);
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
    expect(mockedApi).toHaveBeenCalledTimes(4);
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
