import fs from 'fs/promises';
import path from 'path';

import * as v from 'valibot';

/**
 * On-disk pool of pre-attested signing-bot identities, populated by the
 * `setup-bot-users` project once per run and consumed by worker fixtures.
 *
 * Writing to `test-results/` (gitignored) keeps the file ephemeral per CI job
 * or local run while still surviving cross-process reads (setup writes in the
 * main process; workers read in their own processes).
 */
const POOL_FILE = path.join(process.cwd(), 'test-results', '.bot-user-pool.json');

const BotUserPoolSchema = v.object({
  network: v.string(),
  users: v.record(v.string(), v.string()),
  chatPairs: v.array(v.object({ alice: v.string(), bob: v.string() })),
});

export type BotUserPool = v.InferOutput<typeof BotUserPoolSchema>;

/**
 * Singleton roles — one per-run user per role. Only `chat` remains: auth /
 * authenticated / product-sdk moved to permanent deterministic identities
 * (see helpers/bot-user.ts permanentBotUsername) that need no per-run pool.
 */
export const POOL_ROLES = ['chat'] as const;
export type PoolRole = (typeof POOL_ROLES)[number];

/**
 * Number of distinct Alice+Bob pairs pre-attested for chat-pair scenarios.
 * Each chat-pair test consumes one pair so on-chain statement-store state
 * never bleeds between scenarios. Budget = scenarios × (1 + CI retries).
 * Override via CHAT_PAIR_POOL_SIZE env when adding scenarios.
 */
export const CHAT_PAIR_POOL_SIZE = Number(process.env['CHAT_PAIR_POOL_SIZE']) || 6;

export async function writePool(pool: BotUserPool): Promise<void> {
  await fs.mkdir(path.dirname(POOL_FILE), { recursive: true });
  await fs.writeFile(POOL_FILE, JSON.stringify(pool, null, 2), 'utf-8');
}

export async function readPool(): Promise<BotUserPool | null> {
  try {
    const raw = await fs.readFile(POOL_FILE, 'utf-8');
    return v.parse(BotUserPoolSchema, JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function removePool(): Promise<void> {
  await fs.rm(POOL_FILE, { force: true });
}

/**
 * Per-worker identity lookup, keyed by `parallelIndex` so concurrent workers
 * never share an on-chain identity. The role keeps a single pooled identity,
 * handed only to worker 0; any further parallel worker gets `undefined` so
 * the caller falls back to a freshly generated identity instead of colliding
 * on the singleton.
 *
 * Returns `undefined` (→ caller generates a fresh identity) when the pool file
 * is missing or the slot is unfilled.
 */
export async function readPoolUserForSlot(role: PoolRole, parallelIndex: number): Promise<string | undefined> {
  const pool = await readPool();
  if (!pool) return undefined;
  return parallelIndex === 0 ? pool.users[role] : undefined;
}
