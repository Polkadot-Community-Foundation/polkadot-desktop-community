// Populated only by resources that were actually overridden, so a reset costs
// nothing for the ones that weren't. Each entry is a resource's own cleanup —
// nothing here knows what a resource is.
const cleanups = new Set<VoidFunction>();

/** Called by a resource when `instead` takes effect. */
export function onOverride(cleanup: VoidFunction): void {
  cleanups.add(cleanup);
}

/**
 * Restores every overridden resource's real request and clears the values the
 * override produced.
 *
 * Wired into `vitest.setup.js` as a global `afterEach`, so a spec that calls
 * `resource.instead(...)` never leaks into the next one.
 */
export function resetResourceOverrides(): void {
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
}
