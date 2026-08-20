import { useEffect, useState } from "react";

/**
 * Whether debug logging is on, shared across the renderer.
 *
 * Read once from main and then kept in step by the settings toggle publishing
 * to it. Polling would be the alternative, and a debugging surface that
 * appears up to N seconds after you enable it is its own small mystery.
 */

let enabled: boolean | null = null;
let inFlight: Promise<boolean> | null = null;
const listeners = new Set<(value: boolean) => void>();

function publish(value: boolean) {
  enabled = value;
  for (const listener of listeners) listener(value);
}

/** Called by the settings toggle so the change lands immediately. */
export function setDebugLoggingEnabled(value: boolean): void {
  publish(value);
}

function load(): Promise<boolean> {
  if (!inFlight) {
    inFlight = Promise.resolve(window.electronAPI?.getDebugState?.())
      .then((state) => Boolean(state?.enabled))
      .catch(() => false)
      .then((value) => {
        publish(value);
        return value;
      });
  }
  return inFlight;
}

export function useDebugEnabled(): boolean {
  const [value, setValue] = useState(enabled ?? false);

  useEffect(() => {
    listeners.add(setValue);
    if (enabled === null) load();
    else setValue(enabled);
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}
