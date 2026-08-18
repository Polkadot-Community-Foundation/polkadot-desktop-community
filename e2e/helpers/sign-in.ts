import { type Page } from '@playwright/test';

import { OnboardingPage } from '../page-objects/OnboardingPage';

import { BotUserSession, deleteBotUser, generateBotUsername, isPermanentBotUsername } from './bot-user';
import { errorMessage } from './errors';
import { STUCK_PAIRING_TIMEOUT, VERY_LONG_TIMEOUT } from './timeouts';

/**
 * Sign-in resilience helpers shared by the `authenticated` and `chatPair`
 * fixtures.
 *
 * Both fixtures pair against the nightly chain (`paseo-next-v2`) whose
 * attestation/finality occasionally lags: the signing bot reports paired before
 * the identity is finalized, so the handshake wedges in `Pending` ("Completing
 * pairing…") and never redirects to `/dashboard`. A full relaunch (or storage
 * reset) after a short settle gives the chain time to catch up.
 *
 * The two levers here:
 *  - `waitForDashboardOrStuck` fails a wedged attempt early (≈`STUCK_PAIRING_TIMEOUT`)
 *    instead of burning the whole `VERY_LONG_TIMEOUT`, so retries are cheap;
 *  - `withSignInRetries` runs the attempt up to `SIGN_IN_ATTEMPTS` times with a
 *    settle delay, in one place so both fixtures share the same policy.
 */

export const SIGN_IN_ATTEMPTS = 3;
export const SIGN_IN_RETRY_DELAY_MS = 10_000;

/** Thrown when the pairing handshake is wedged in `Pending` past the threshold. */
export class StuckPairingError extends Error {
  constructor(seconds: number) {
    super(`Pairing stuck on "Completing pairing…" for ${seconds}s without reaching /dashboard`);
    this.name = 'StuckPairingError';
  }
}

/**
 * Thrown when the app shows the "Limit Reached" pairing error — the peer
 * reported no free allowance slots (`no free statement-store slot for device
 * registration` from the signing bot): the bot user's per-day
 * device-registration budget (`LiteStmtStoreSlotsPerPeriod`) is exhausted.
 * Retrying with the same identity is pointless within a run (the budget is
 * daily and each attempt uses a fresh device account), so retries abort and
 * a permanent user heals immediately.
 */
export class PairingLimitError extends Error {
  constructor() {
    super('Pairing rejected with "Limit Reached" — the bot user\'s daily allowance-slot budget is exhausted');
    this.name = 'PairingLimitError';
  }
}

/**
 * Resolve once the app reaches `/dashboard`. Aborts early with:
 *  - `StuckPairingError` if the handshake spinner stays up continuously for
 *    `STUCK_PAIRING_TIMEOUT` without navigating — the nightly-lag wedge;
 *  - `PairingLimitError` if the "Limit Reached" (no-free-slots) error panel
 *    appears — deterministic for the rest of the day, so waiting the full
 *    `VERY_LONG_TIMEOUT` (and retrying) only wastes budget.
 * A genuinely slow-but-healthy handshake that clears late still wins the
 * race; a false abort merely triggers one extra relaunch, never a hard failure.
 */
export async function waitForDashboardOrStuck(page: Page): Promise<void> {
  const onboarding = new OnboardingPage(page);

  const navigated = page.waitForURL(/dashboard/, { timeout: VERY_LONG_TIMEOUT });

  const stuck = (async () => {
    // Wait for the spinner to appear at all (bounded by VERY_LONG_TIMEOUT). If it
    // never does, the navigated promise governs the outcome instead.
    await onboarding.completingPairing.waitFor({ state: 'visible', timeout: VERY_LONG_TIMEOUT });
    // It's up — give the handshake a window to clear. If navigation happens in
    // the meantime, `navigated` settles the race first and this branch is
    // abandoned. If we reach the end with the spinner still visible, it's wedged.
    await page.waitForTimeout(STUCK_PAIRING_TIMEOUT);
    if (await onboarding.completingPairing.isVisible()) {
      throw new StuckPairingError(Math.round(STUCK_PAIRING_TIMEOUT / 1000));
    }
    // Cleared but not navigated yet — defer to `navigated` for the final word.
    await navigated;
  })();

  const limitReached = (async () => {
    await onboarding.pairingLimitReachedError.waitFor({ state: 'visible', timeout: VERY_LONG_TIMEOUT });
    throw new PairingLimitError();
  })();
  // When another racer settles first, this one still rejects later (waitFor
  // timeout or the error panel appearing after navigation is impossible, but
  // the timeout rejection is guaranteed) — mark it handled to avoid an
  // unhandled-rejection crash after the race is over.
  limitReached.catch(() => {});

  await Promise.race([navigated, stuck, limitReached]);
}

/**
 * Run a sign-in `attempt` up to `attempts` times. Between failures it waits
 * `delayMs` (chain settle) and runs the optional `beforeRetry` hook (e.g. a
 * storage reset) before the next try. Surfaces the last error if all attempts
 * fail. Logging format matches the prior per-fixture loops.
 */
export async function withSignInRetries<T>(
  attempt: () => Promise<T>,
  opts: {
    label: string;
    attempts?: number;
    delayMs?: number;
    beforeRetry?: () => Promise<void>;
  },
): Promise<T> {
  const attempts = opts.attempts ?? SIGN_IN_ATTEMPTS;
  const delayMs = opts.delayMs ?? SIGN_IN_RETRY_DELAY_MS;
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      if (i === attempts) break;
      // The slot budget is per-day: every retry pairs a fresh device account, so
      // it hits the same exhausted budget. Surface immediately (a permanent
      // user's caller heals; anything else fails fast instead of burning
      // attempts).
      if (err instanceof PairingLimitError) break;
      console.warn(
        `[${opts.label}] sign-in attempt ${i}/${attempts} failed (${errorMessage(err)}); ` + `retrying in ${delayMs / 1000}s…`,
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
      if (opts.beforeRetry) await opts.beforeRetry();
    }
  }

  throw lastError;
}

/**
 * A permanent user wedged in pairing (`StuckPairingError` — the bot's DB says
 * attested but the chain was redeployed, personhood gone) or rejected with
 * "Limit Reached" (`PairingLimitError` — the user's 10/day allowance-slot
 * budget is exhausted) is unrecoverable by retry. Both are fixed by deleting
 * the bot user — recreation issues fresh keys/entropy, so the next run attests
 * cleanly into a fresh slot space. Random `testbot…` users are already fresh;
 * deleting them buys nothing.
 */
export function shouldHealPermanentUser(err: unknown, username: string): boolean {
  return (err instanceof StuckPairingError || err instanceof PairingLimitError) && isPermanentBotUsername(username);
}

/**
 * Sign in as `username` with the shared retry policy; if the attempts exhaust
 * on a wedged pairing AND the user is permanent, heal: best-effort DELETE the
 * bot user, then retry the whole flow as a freshly generated identity
 * (attested on the spot). Returns the username that actually signed in so the
 * caller can log/assert against it.
 */
export async function signInWithHeal(opts: {
  label: string;
  network: string;
  botUrl: string;
  botToken: string | undefined;
  username: string;
  attempt: (username: string) => Promise<void>;
  beforeRetry?: () => Promise<void>;
  retryDelayMs?: number;
}): Promise<string> {
  try {
    // Permanent users keep a short first phase — their real recovery is the
    // heal below (2 + 2). A non-permanent identity never heals, so it keeps
    // the full shared budget instead of silently dropping from 3 to 2.
    await withSignInRetries(() => opts.attempt(opts.username), {
      label: opts.label,
      attempts: isPermanentBotUsername(opts.username) ? 2 : SIGN_IN_ATTEMPTS,
      delayMs: opts.retryDelayMs,
      beforeRetry: opts.beforeRetry,
    });
    return opts.username;
  } catch (err) {
    if (!shouldHealPermanentUser(err, opts.username)) throw err;

    console.warn(
      `[${opts.label}] permanent user "${opts.username}" is wedged (${errorMessage(err)}); ` +
        `deleting it on the bot and falling back to a fresh identity. ` +
        `The next run recreates "${opts.username}" with one clean attestation.`,
    );
    await deleteBotUser({ username: opts.username, network: opts.network, botUrl: opts.botUrl, botToken: opts.botToken });

    const fresh = generateBotUsername();
    await new BotUserSession(fresh, opts.botUrl, opts.botToken).ensure(opts.network);
    if (opts.beforeRetry) await opts.beforeRetry();
    await withSignInRetries(() => opts.attempt(fresh), {
      label: `${opts.label}:healed`,
      attempts: 2,
      delayMs: opts.retryDelayMs,
      beforeRetry: opts.beforeRetry,
    });
    return fresh;
  }
}
