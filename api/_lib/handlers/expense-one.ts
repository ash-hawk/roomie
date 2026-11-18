import { withHousehold } from '../context.js';
import { body, id, json, segments } from '../http.js';
import { deleteExpense, editExpense } from '../finance.js';

export const DELETE = withHousehold(async ({ user, householdId, req }) => {
  await deleteExpense(user, householdId, id(segments(req)[3], 'expense id'));
  return json({ ok: true });
});

export const PATCH = withHousehold(async ({ user, householdId, req }) =>
  json(await editExpense(user, householdId, id(segments(req)[3], 'expense id'), await body(req))));
