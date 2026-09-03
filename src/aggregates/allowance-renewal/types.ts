/**
 * `waiting` — the user has been asked to open the mobile app and we are polling
 * the chain for the new slot. Semantic, not presentational: consumers decide
 * what to render for it.
 */
export type AllowanceRenewalStatus = 'idle' | 'waiting';
