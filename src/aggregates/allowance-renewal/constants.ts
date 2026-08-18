// How often the renewal poll re-reads the current-period slots while waiting for mobile.
export const POLL_INTERVAL_MS = 5_000;

// Upper bound on a renewal wait. Mirrors the remote-signing bound the SSO request
// itself uses (widgets/ProductContainerBinding/withSigningTimeout.ts — SIGNING_TIMEOUT_MS).
// Duplicated rather than imported: an aggregate must not import from a widget.
export const RENEWAL_TIMEOUT_MS = 240_000;
