import crypto from 'crypto';

import { errorMessage } from './errors';

/**
 * Cloudflare in front of the signing-bot host occasionally
 * returns a gateway error for a few seconds at a time, and the attest endpoint
 * itself returns a transient 500 when the on-chain extrinsic lags behind the
 * API accepting the registration. Retry policy differs per endpoint because
 * the two operations fail differently:
 *
 * - `create` (POST /api/users) is idempotent BY NAME (`getOrCreateUser`), so
 *   any gateway error — 502/503/504/524 — is safe to blindly re-POST.
 * - `attest` is NOT idempotent while the first attempt is still in flight:
 *   every registration the backend accepts lands a personhood entry with a
 *   fresh numeric index (e.g. "testbot….15"), and the "already attested"
 *   short-circuit only kicks in AFTER one of them confirms. A 524 (Cloudflare
 *   edge gave up but the origin kept going) or the explicit 500 "On-chain
 *   confirmation timed out … the extrinsic did not land" mean the first
 *   registration may still land — blindly re-POSTing produced DUPLICATE
 *   registrations ("name.15" + "name.34"), which broke contact-search e2e on
 *   every platform. For attest those responses are treated as
 *   SUBMITTED-PENDING: the caller polls attestation status and only re-attests
 *   after the poll window expires. Only 502/503 (origin never processed the
 *   request) are blindly retried for attest.
 */
const RETRY_SAFE_STATUSES = new Set([502, 503]);
const MAYBE_PROCESSED_STATUSES = new Set([504, 524]);
const TRANSIENT_500_BODY = /on-chain confirmation timed out|extrinsic did not land|retry attestation/i;
const FETCH_MAX_ATTEMPTS = 4;
const FETCH_RETRY_BASE_MS = 1_000;

/**
 * Blind-retry policy for idempotent-by-name calls (`create`). Status-only for
 * gateway errors; the 500 case peeks at a cloned body so the original stream
 * stays readable by the caller. Exported for unit testing.
 */
export async function isTransientResponse(res: Response): Promise<boolean> {
  if (RETRY_SAFE_STATUSES.has(res.status) || MAYBE_PROCESSED_STATUSES.has(res.status)) return true;
  if (res.status === 500) {
    const body = await res
      .clone()
      .text()
      .catch(() => '');
    return TRANSIENT_500_BODY.test(body);
  }
  return false;
}

/**
 * Blind-retry policy for `attest`: only errors where the origin never saw the
 * request. Exported for unit testing.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- matches the retry-predicate signature shared with isTransientResponse
export async function isAttestRetriableResponse(res: Response): Promise<boolean> {
  return RETRY_SAFE_STATUSES.has(res.status);
}

/**
 * Whether an attest failure means "the registration may still land on chain" —
 * the caller must poll attestation status instead of re-POSTing (a re-POST
 * risks a duplicate lite-username registration). Exported for unit testing.
 */
export async function isAttestPendingResponse(res: Response): Promise<boolean> {
  if (MAYBE_PROCESSED_STATUSES.has(res.status)) return true;
  if (res.status === 500) {
    const body = await res
      .clone()
      .text()
      .catch(() => '');
    return TRANSIENT_500_BODY.test(body);
  }
  return false;
}

type RetryPredicate = (res: Response) => Promise<boolean>;

async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  isRetriable: RetryPredicate = isTransientResponse,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok || attempt === FETCH_MAX_ATTEMPTS || !(await isRetriable(res))) {
        return res;
      }
      console.warn(
        `[BOT-USER] ${init?.method ?? 'GET'} ${input} returned ${res.status} (attempt ${attempt}/${FETCH_MAX_ATTEMPTS}); retrying...`,
      );
    } catch (err) {
      lastErr = err;
      if (attempt === FETCH_MAX_ATTEMPTS) throw err;
      console.warn(
        `[BOT-USER] ${init?.method ?? 'GET'} ${input} threw "${errorMessage(err)}" (attempt ${attempt}/${FETCH_MAX_ATTEMPTS}); retrying...`,
      );
    }
    await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_BASE_MS * 2 ** (attempt - 1)));
  }
  // Unreachable — the loop either returns or throws.
  throw lastErr ?? new Error('[BOT-USER] fetchWithRetry exhausted retries');
}

/**
 * Signing-bot test user lifecycle.
 *
 * Per-run random usernames avoid the pairing/session collisions a shared static
 * identity (e.g. `desktoptest-authenticated`) caused between parallel CI jobs
 * in the matrix of OS × project.
 *
 * Lifecycle: generated once in `setup-bot-users`, reused by workers (fixtures
 * pull from the pool via `e2e/setup/bot-user-pool.ts`), DELETEd in
 * `teardown-bot-users`. `ensure()` here is used by the setup project and by
 * fallback paths when the pool is missing.
 */

// Must satisfy `/^[a-z]{6,}$/` — enforced by both the signing-bot (liteUsername)
// and the identity-backend (username on attest). No digits, only lowercase a–z.
const USER_PREFIX = 'testbot';
const SUFFIX_LENGTH = 10;
const USERNAME_REGEX = /^[a-z]{6,}$/;

/**
 * Pure random `testbot<10lc>` generator. Used by callers that need a distinct
 * identity regardless of the `BOT_USERNAME` env (e.g. pool setup picking 6
 * separate usernames; chat-pair fallback with distinct Alice and Bob).
 */
export function generateBotUsername(): string {
  const bytes = crypto.randomBytes(SUFFIX_LENGTH);
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += String.fromCharCode(97 + ((bytes[i] ?? 0) % 26));
  }
  const username = `${USER_PREFIX}${suffix}`;
  if (!USERNAME_REGEX.test(username)) {
    throw new Error(`Generated bot username "${username}" does not match ${USERNAME_REGEX}`);
  }
  return username;
}

/**
 * Env-aware wrapper — honours `BOT_USERNAME` for single-project manual repro.
 * Prefer `generateBotUsername()` when multiple distinct identities are needed
 * in one process (env override would collide them).
 */
export function makeBotUsername(): string {
  return process.env['BOT_USERNAME'] ?? generateBotUsername();
}

/**
 * Permanent (cross-run) bot users. Deterministic names let every run reuse an
 * already-attested identity: `ensure()` becomes an instant check instead of a
 * 30–60s on-chain attestation. Concurrent runs sharing a name are safe — the
 * bot deduplicates signer sessions by (username, network, clientId) and the
 * app sends a unique clientId per pairing.
 *
 * Name layout: `<base><workerLetter?><osSuffix>`. The OS suffix keeps the
 * 3-OS CI matrix on separate daily allowance-slot budgets
 * (Resources.LiteStmtStoreSlotsPerPeriod = 10/user/day) and keeps foreign
 * devices out of session-list assertions. The `desktop` prefix distinguishes
 * permanent users from `testbot…` randoms — teardown and the heal path key on it.
 */
const PERMANENT_PREFIX = 'desktop';

export const OS_SUFFIX: 'linux' | 'macos' | 'windows' =
  process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';

export function permanentBotUsername(base: string, parallelIndex?: number): string {
  if (!base.startsWith(PERMANENT_PREFIX)) {
    throw new Error(`Permanent bot username base "${base}" must start with "${PERMANENT_PREFIX}"`);
  }
  let workerLetter = '';
  if (parallelIndex !== undefined) {
    if (parallelIndex < 0 || parallelIndex > 25) {
      throw new Error(`Permanent bot username worker index ${parallelIndex} out of range (0–25)`);
    }
    workerLetter = String.fromCharCode(97 + parallelIndex);
  }
  const username = `${base}${workerLetter}${OS_SUFFIX}`;
  if (!USERNAME_REGEX.test(username)) {
    throw new Error(`Permanent bot username "${username}" does not match [a-z]{6,} (${USERNAME_REGEX})`);
  }
  return username;
}

export function isPermanentBotUsername(username: string): boolean {
  return username.startsWith(PERMANENT_PREFIX);
}

type BotRequestOptions = {
  botUrl: string;
  botToken: string | undefined;
};

type UserRequestOptions = BotRequestOptions & {
  username: string;
  network: string;
};

function headers(botToken: string | undefined): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (botToken) h['Authorization'] = `Bearer ${botToken}`;
  return h;
}

/**
 * Idempotently create + attest the bot user for the given network.
 * - POST /api/users — returns existing user if it already exists.
 * - POST /api/users/:username/attest — no-op if already attested.
 *
 * Attestation is on-chain, takes 30–60s on first call.
 */
async function createBotUser({ username, network, botUrl, botToken }: UserRequestOptions): Promise<{ attested: boolean }> {
  const res = await fetchWithRetry(`${botUrl}/api/users`, {
    method: 'POST',
    headers: headers(botToken),
    body: JSON.stringify({ username, network }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST /api/users failed (${res.status}): ${body}`);
  }

  const data: { attested?: boolean } = await res.json();
  return { attested: !!data.attested };
}

/**
 * Submit one attestation attempt. Returns:
 * - `'attested'` — the bot confirmed the registration landed.
 * - `'pending'` — the request likely reached the backend but confirmation
 *   timed out (524 / 504 / the explicit on-chain-timeout 500). The caller must
 *   poll attestation status; re-POSTing here would risk registering the lite
 *   username twice (duplicate "name.NN" personhood entries).
 *
 * Genuine failures (anything else non-ok) throw.
 */
async function attestBotUser({ username, network, botUrl, botToken }: UserRequestOptions): Promise<'attested' | 'pending'> {
  const res = await fetchWithRetry(
    `${botUrl}/api/users/${encodeURIComponent(username)}/attest?network=${encodeURIComponent(network)}`,
    {
      method: 'POST',
      headers: headers(botToken),
    },
    isAttestRetriableResponse,
  );

  if (res.ok) return 'attested';

  if (await isAttestPendingResponse(res)) {
    console.warn(
      `[BOT-USER] attest "${username}"@${network} returned ${res.status} after the backend may have accepted the registration; ` +
        `polling attestation status instead of re-attesting (a blind retry double-registers the lite username).`,
    );
    return 'pending';
  }

  const body = await res.text().catch(() => '');
  throw new Error(`POST /api/users/${username}/attest failed (${res.status}): ${body}`);
}

/**
 * Poll the bot until it confirms the user is attested on-chain. The attest
 * HTTP response returns as soon as the tx is submitted — chain finality can
 * lag by tens of seconds. Signing in before finality fails silently
 * (`waitForURL(/dashboard/)` times out), so every ensure() blocks on this.
 */
async function waitUntilAttested({
  username,
  network,
  botUrl,
  botToken,
  timeoutMs = 120_000,
  intervalMs = 3_000,
}: UserRequestOptions & { timeoutMs?: number; intervalMs?: number }): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // Plain fetch — the polling loop is itself the retry, so we don't
    // double-stack delays on transient 5xx.
    const res = await fetch(`${botUrl}/api/users/${encodeURIComponent(username)}?network=${encodeURIComponent(network)}`, {
      method: 'GET',
      headers: headers(botToken),
    }).catch(() => null);
    if (res?.ok) {
      const data: { attested?: boolean } = await res.json().catch(() => ({}));
      if (data.attested) return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * The registered on-chain lite username — the bot username plus the numeric
 * index the identity backend appends on registration (e.g.
 * "testbotoopgrxiwaq.15"). This is the string the app's contact search
 * renders, and the ONLY string guaranteed unique in the result list: the bare
 * bot username is a substring of every registration of that name, so a
 * duplicate registration makes substring matches ambiguous.
 *
 * Read from `/chat-status` — a side-effect-free GET (the plain user GET does
 * not expose liteUsername). Returns undefined when the bot doesn't know it.
 */
async function fetchLiteUsername({ username, network, botUrl, botToken }: UserRequestOptions): Promise<string | undefined> {
  const res = await fetch(
    `${botUrl}/api/users/${encodeURIComponent(username)}/chat-status?network=${encodeURIComponent(network)}`,
    { method: 'GET', headers: headers(botToken) },
  ).catch(() => null);
  if (!res?.ok) return undefined;
  const data: { liteUsername?: string } = await res.json().catch(() => ({}));
  return typeof data.liteUsername === 'string' && data.liteUsername.length > 0 ? data.liteUsername : undefined;
}

/**
 * Best-effort DELETE of a pooled bot user. Logs outcome, swallows errors —
 * teardown runs once per test-run and shouldn't fail CI on a stray 500.
 */
export async function deleteBotUser({ username, network, botUrl, botToken }: UserRequestOptions): Promise<void> {
  try {
    const res = await fetch(`${botUrl}/api/users/${encodeURIComponent(username)}?network=${encodeURIComponent(network)}`, {
      method: 'DELETE',
      headers: headers(botToken),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const result: { deleted?: boolean } = await res.json().catch(() => ({}));
      console.info(`[BOT-USER] Deleted "${username}"@${network}: ${result.deleted ?? 'unknown'}`);
    } else {
      console.warn(`[BOT-USER] DELETE "${username}"@${network} failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[BOT-USER] DELETE "${username}"@${network} error (best-effort):`, errorMessage(err));
  }
}

/**
 * Per-(username) create+attest session. `ensure(network)` caches on the
 * instance so repeated calls within a worker avoid the round-trip to /api/users.
 * Cleanup happens in `teardown-bot-users`, not here.
 */
export class BotUserSession {
  private readonly ensuredNetworks = new Set<string>();
  private readonly liteUsernames = new Map<string, string>();

  constructor(
    readonly username: string,
    private readonly botUrl: string,
    private readonly botToken: string | undefined,
  ) {
    if (!botUrl) {
      throw new Error('BOT_URL env var is required for tests that sign in via the signing bot');
    }
  }

  async ensure(network: string): Promise<void> {
    if (this.ensuredNetworks.has(network)) return;

    console.info(`[BOT-USER] Ensuring "${this.username}"@${network}...`);
    const opts = { username: this.username, network, botUrl: this.botUrl, botToken: this.botToken };
    const { attested } = await createBotUser(opts);

    if (!attested) {
      // Up to 2 submissions. After each one — whether the bot confirmed
      // ('attested') or the confirmation timed out ('pending') — poll until
      // the registration is visible. Only when a full poll window expires do
      // we submit again: by then a still-in-flight first registration would
      // have landed and the second call short-circuits on "already attested",
      // so the duplicate-registration window is as narrow as we can make it.
      const ATTEST_SUBMISSIONS = 2;
      let confirmed = false;
      for (let attempt = 1; attempt <= ATTEST_SUBMISSIONS && !confirmed; attempt++) {
        console.info(
          `[BOT-USER] Attesting "${this.username}"@${network} (on-chain, may take 30–60s, submission ${attempt}/${ATTEST_SUBMISSIONS})...`,
        );
        await attestBotUser(opts);
        confirmed = await waitUntilAttested(opts);
      }
      if (!confirmed) {
        throw new Error(
          `[BOT-USER] Timed out waiting for "${this.username}"@${network} to reach attested=true after ${ATTEST_SUBMISSIONS} attest submissions`,
        );
      }
    }

    this.ensuredNetworks.add(network);
    console.info(`[BOT-USER] "${this.username}"@${network} ready`);
  }

  /**
   * Resolve the registered lite username (with the backend-assigned numeric
   * index, e.g. "testbot….15") for UI assertions. Falls back to the bare bot
   * username with a warning when the bot can't report it.
   */
  async resolveLiteUsername(network: string): Promise<string> {
    const cached = this.liteUsernames.get(network);
    if (cached) return cached;

    const lite = await fetchLiteUsername({ username: this.username, network, botUrl: this.botUrl, botToken: this.botToken });
    if (!lite) {
      console.warn(
        `[BOT-USER] Bot did not report a liteUsername for "${this.username}"@${network}; falling back to the bare username. ` +
          `UI matches may be ambiguous if the name was registered more than once.`,
      );
      return this.username;
    }
    this.liteUsernames.set(network, lite);
    return lite;
  }
}
