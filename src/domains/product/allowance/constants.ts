// Statement-store slot period length; mirrors Android's CurrentPeriodProvider (1 day).
export const SLOT_PERIOD_SECONDS = 86_400;

// Chain reads racing this timeout resolve the pre-check to "insufficient" (SSO fallback).
export const ALLOWANCE_CHECK_TIMEOUT_MS = 8_000;
