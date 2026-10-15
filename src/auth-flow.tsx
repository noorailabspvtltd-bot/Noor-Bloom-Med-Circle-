import { useSyncExternalStore } from "react";

type Flow = { busy: boolean; error: string };
let current: Flow = { busy: false, error: "" };
const listeners = new Set<() => void>();
export function setAuthFlow(value: Flow) {
  current = value;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useAuthFlow() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
