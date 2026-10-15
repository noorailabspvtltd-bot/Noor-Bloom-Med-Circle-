import { transition, type Action, type ClinicState } from "./clinic";
export function cloudTransition(
  state: ClinicState,
  action: Action,
  operationId: string,
) {
  let count = 0;
  const next = transition(
    state,
    action,
    (prefix) => `${prefix}-${operationId}-${++count}`,
  );
  if (action.type === "book") next.visits[0].status = "Requested";
  return next;
}
