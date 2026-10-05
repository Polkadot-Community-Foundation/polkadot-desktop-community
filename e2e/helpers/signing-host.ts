import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { randomInt } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { errorMessage } from './errors';
import { findRegistrations } from './identity-backend';

/** Binary location. `TRUAPI_HOST_BIN` overrides for a local source build. */
export const SIGNING_HOST_BIN = process.env['TRUAPI_HOST_BIN'] ?? 'truapi-host';

/**
 * Root holding one `--base-path` per worker slot, each with its own signer identity and
 * a plaintext 0600 mnemonic. In CI this tree is restored from cache so identities — and
 * their registered usernames — survive across runs.
 */
export const CACHE_ROOT = process.env['TRUAPI_HOST_BASE_PATH'] ?? path.join(process.cwd(), '.truapi-host');

/**
 * Stem every base this harness mints starts with, so a registration can be attributed
 * to it from the name alone. Deliberately distinct from the bases the previous
 * signing-bot harness used (`desktoptest`, `testbot`, `desktop`).
 */
const LITE_USERNAME_STEM = 'truapitest';

/**
 * Random letters appended to the stem. Ten is what the signing-bot harness used
 * (`testbotaacswfaynw`), and 26^10 makes a repeat not worth guarding against; the
 * result stays inside the backend's 6..=29-byte base rule.
 */
const LITE_USERNAME_ENTROPY_LETTERS = 10;

const LOWERCASE_ASCII = 'abcdefghijklmnopqrstuvwxyz';

/**
 * A base no identity has used before — never a shared one.
 *
 * A base is a finite chain-level pool, not a namespace: the identity backend answers
 * `EXHAUSTED` once its 99 discriminators are gone, and equally once the bare name is
 * owned or its reservation queue (capacity 10) is full. `truapi-host` turns any answer
 * but `AVAILABLE` into `lite username "<base>" is taken` and refuses to provision, so an
 * exhausted base does not degrade — it stops every identity the suite has yet to mint.
 *
 * One fixed base did reach that state on 2026-09-17 and failed all four signer-backed
 * projects at once, because ~20 slots across them mint under it and a cold cache re-mints
 * the lot. A base used exactly once cannot be drawn down at all, which is why the
 * previous signing-bot harness randomised its bases too.
 *
 * Exported for unit testing; the CLI only ever consults this when *creating* an account,
 * so a slot that restores its identity from disk ignores whatever is passed.
 */
export function freshLiteUsernameBase(): string {
  const letters = Array.from({ length: LITE_USERNAME_ENTROPY_LETTERS }, () => LOWERCASE_ASCII[randomInt(LOWERCASE_ASCII.length)]);

  return LITE_USERNAME_STEM + letters.join('');
}

/**
 * Documented readiness signal (`signing-host --help`). Not `Listening for product
 * frames`: that prints before provisioning completes, so keying on it treats a
 * still-provisioning host as ready — and killing one costs an attested identity.
 */
const SERVE_READY_LINE = 'Signing host ready';

/** `✓ Paired with <lite-username>` — the resolved identity, printed on every start. */
export const PAIRED_LINE = /Paired with\s+(\S+)/;

/**
 * CSI sequences, which `truapi-host` colourises its output with.
 *
 * MUST be applied before `PAIRED_LINE`: `\S+` is happy to swallow a trailing reset, and
 * the resulting `truapitest.43\u001b[0m` matches no username in the UI. This is worth
 * stripping rather than suppressing at the source because Playwright's reporter already
 * strips these codes when it forwards worker stdout to a non-TTY file — so a saved log
 * shows a clean name while the string parsed here still carries the escape, and the
 * defect is invisible in exactly the artifact you would debug from.
 */
// eslint-disable-next-line no-control-regex -- ESC is the character being matched, not a typo
const ANSI_ESCAPE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Exported for unit testing — see the ANSI note on `ANSI_ESCAPE`. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}

/**
 * Deliberately generous, and NOT to be tightened.
 *
 * Any timeout that fires around a provisioning `--serve` spends an identity: the
 * username registration is POSTed within the first seconds of startup — a run killed
 * after 3s was already answered `worker.70` — and nothing local records that it
 * happened. So the cost is not "a long kill is expensive", it is "any kill is".
 * Cold provisioning was separately observed over 45s and, on a loaded identity backend,
 * past 120s, so a budget that could plausibly fire on a healthy run is the failure mode.
 *
 * paritytech/host-rust-core#806 adds a provisioning notice under `--serve`, which makes
 * the wait legible; it does not make it safe to cut short.
 */
const READY_TIMEOUT_MS = 600_000;
const EXEC_TIMEOUT_MS = 60_000;
const STOP_GRACE_MS = 5_000;

/**
 * Per-slot signer directory. Identity is addressed by PATH, not by `--session`.
 *
 * paritytech/host-rust-core#807 adds an alias so a promoted provisional name resolves
 * again, which removes the mint-per-run hazard that first ruled `--session` out. The
 * base-path model stays regardless: a directory is a thing this harness owns outright,
 * where a session name is a key the CLI interprets. The alias only applies to sessions
 * promoted by a fixed binary, so a slot promoted by an older one behaves as before.
 */
export function slotPath(project: string, parallelIndex: number, suffix = ''): string {
  if (!Number.isInteger(parallelIndex) || parallelIndex < 0) {
    throw new Error(`[signing-host] worker index must be a non-negative integer, got ${parallelIndex}`);
  }

  return path.join(CACHE_ROOT, `${project}-w${parallelIndex}${suffix}`);
}

/**
 * Whether a slot will restore its existing identity rather than silently provisioning a
 * new one.
 *
 * On 0.16.0 stable, selection is driven entirely by the `current-session` pointer file,
 * never by the accounts present on disk. If that file is missing, or names a directory
 * that no longer exists, the CLI falls back to the `default` session — which reports
 * `<not provisioned>` — and a `--serve` in that state attests a fresh identity while the
 * real one sits unused beside it.
 *
 * Checks the pointer, not the account count: a slot holding two account directories is
 * benign (the pointer decides), while a slot holding one account and a broken pointer is
 * the case that costs an identity. Keys on `session.json`, observed in a provisioned
 * session directory and absent from an unprovisioned one.
 *
 * paritytech/host-rust-core#808 changes the fallback: a lost or dangling pointer now
 * adopts the one provisioned directory (warning), or hard-errors when several exist. So
 * once that ships this predicts "will this restore silently, loudly, or not at all"
 * rather than "will this quietly mint an identity" — still worth reporting, no longer
 * the difference between a warm run and a spent suffix.
 *
 * TODO(truapi-host): simplify to a plain "does this slot have an identity" check once
 * the #808 behaviour is in a release the installer resolves.
 */
export async function slotWillRestore(basePath: string, network: string): Promise<boolean> {
  const root = path.join(basePath, 'v2', network);
  try {
    const pointer = (await fs.readFile(path.join(root, 'signing-host', 'current-session'), 'utf8')).trim();
    if (!pointer) return false;
    await fs.access(path.join(root, `${pointer}_signing_host`, 'session.json'));

    return true;
  } catch {
    return false;
  }
}

/**
 * No `--session`: the CLI auto-selects the account already under `basePath`.
 *
 * The base is minted per call rather than held for the slot, because the CLI reads it
 * only when it creates an account — at most one call per slot ever does, and every other
 * one (a restart, an `exec`) passes a base that is never looked at.
 */
function baseArgs(basePath: string, network: string): string[] {
  return ['signing-host', '--base-path', basePath, '--network', network, '--lite-username-prefix', freshLiteUsernameBase()];
}

/** Run one `exec '<command>'` and resolve with its stdout. Rejects on non-zero exit. */
async function execCommand(basePath: string, network: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(SIGNING_HOST_BIN, [...baseArgs(basePath, network), '--auto-accept', 'exec', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`[signing-host] exec "${command}" timed out after ${EXEC_TIMEOUT_MS}ms`));
    }, EXEC_TIMEOUT_MS);

    child.stdout.on('data', chunk => (stdout += String(chunk)));
    child.stderr.on('data', chunk => (stderr += String(chunk)));
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`[signing-host] exec "${command}" exited ${code}: ${stderr || stdout}`));
    });
  });
}

export class SigningHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  /** Every network this slot has started on, so teardown can clear each one's devices. */
  private readonly startedNetworks = new Set<string>();
  private liteUsernameFromOutput: string | undefined;

  constructor(readonly basePath: string) {}

  /**
   * Spawn `--serve` answering `deeplink`, and resolve once the CLI reports it is serving.
   * The process stays up to answer signing requests for the whole test.
   *
   * Idempotent by design: a retry or an `@isolated` relaunch calls this again on the same
   * instance, so an already-running process is stopped first rather than treated as an
   * error.
   */
  async pair(deeplink: string, network: string): Promise<void> {
    await this.spawnServe(network, ['--deeplink', deeplink]);
  }

  /** Start `--serve` with no deeplink, to provision or restore the slot's identity. */
  async start(network: string): Promise<void> {
    await this.spawnServe(network, []);
  }

  /**
   * The registered lite username for this slot's identity — the string the app's contact
   * search renders, and the only one guaranteed unique in a result list.
   *
   * Requires a prior `pair()` or `start()`: it is read from the host's own startup output
   * rather than queried, so there is no second process against a live base path.
   */
  async liteUsername(): Promise<string> {
    const fromOutput = this.liteUsernameFromOutput;
    if (!fromOutput) throw new Error(`[signing-host] ${this.basePath} has not started; no username yet`);

    // The startup line already carries the digit suffix, so this is a confirmation
    // against the registry the app's contact search actually reads — not the source of
    // the name. A miss is not fatal: fall back to what the host reported.
    const registrations = await findRegistrations(fromOutput);
    // `null` is "could not tell" — no registry configured, or it could not answer —
    // and `findRegistrations` requires callers not to read it as "not registered"
    // (`identity-backend.ts`). Only an empty array says the claim is absent, and that
    // one is worth a warning: the app's contact search reads the same registry, so a
    // genuinely missing registration means no UI lookup will find this identity.
    if (registrations === null) return fromOutput;

    const registered = registrations[0]?.username;
    if (!registered) {
      console.warn(
        `[signing-host] the registry holds no registration for "${fromOutput}" — contact search ` +
          `will not find this identity. Using the startup name.`,
      );

      return fromOutput;
    }

    return registered;
  }

  /**
   * Remove every saved pairing for this slot, on every network it started on.
   *
   * This is not hygiene. `truapi-host` refuses to rotate an identity while any paired
   * device depends on it, so a pairing left behind by a finished run blocks recovery the
   * next time the slot's daily budget runs out.
   *
   * Best-effort: a failure here must not fail an otherwise-passing test.
   */
  async removeDevices(): Promise<void> {
    for (const network of this.startedNetworks) {
      try {
        // There is no bulk form: `--remove --all` is rejected with "statement account ID
        // must be 32 bytes of hexadecimal". List, parse, remove one at a time.
        //
        // Anchored to line start on purpose. The id is always the first token, but the
        // rest of the line is a device label built from remote-supplied host metadata
        // that nothing sanitises — a global scan could match hex a peer chose.
        // Stripped for the same reason as the startup line: the ids are colourised, and
        // an escape between the anchor and `0x` defeats the match silently.
        const listed = stripAnsi(await execCommand(this.basePath, network, '/devices --list'));
        const ids = [...listed.matchAll(/^0x([0-9a-f]{64})\b/gm)].map(match => match[0]);

        // The floor must NOT derive from the same `0x` assumption the parser makes, or an
        // unexpected rendering yields 0 === 0 and nothing warns — tautological against
        // exactly the uncertainty this guards. The recorded empty form is the only
        // legitimate zero.
        if (ids.length === 0 && !/No paired devices for session/.test(listed)) {
          console.warn(
            `[signing-host] ${this.basePath}@${network}: /devices --list matched no ids and is not the ` +
              `known-empty form; pairings may be leaking. Raw output:\n${listed}`,
          );
        }

        // TODO(truapi-host): `--force` alongside a positional id is unverified — only
        // `--remove <id>` is established. Drop the flag if the CLI rejects the pair.
        for (const id of ids) {
          await execCommand(this.basePath, network, `/devices --remove ${id} --force`);
        }
      } catch (error) {
        console.warn(`[signing-host] ${this.basePath}@${network} device removal: ${errorMessage(error)}`);
      }
    }
    this.startedNetworks.clear();
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;

    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, STOP_GRACE_MS);
      child.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }

  private async spawnServe(network: string, extra: string[]): Promise<void> {
    if (this.child) await this.stop();

    const child = spawn(SIGNING_HOST_BIN, [...baseArgs(this.basePath, network), '--serve', '--auto-accept', ...extra], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.startedNetworks.add(network);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`[signing-host] ${this.basePath} never reported ready within ${READY_TIMEOUT_MS}ms`));
      }, READY_TIMEOUT_MS);

      const onLine = (raw: string) => {
        const text = stripAnsi(raw);

        // Deeplinks are pairing material — the CLI redacts them; never echo one here.
        console.info(`[signing-host:${path.basename(this.basePath)}] ${text.trimEnd()}`);

        const paired = text.match(PAIRED_LINE);
        if (paired?.[1]) this.liteUsernameFromOutput = paired[1];

        if (!settled && text.includes(SERVE_READY_LINE)) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };

      // `data` delivers arbitrary chunks, not lines. Buffer and split, because the
      // username is read from this stream and a chunk boundary inside `truapitest.84`
      // would yield a truncated-but-truthy match.
      let pending = '';
      const onChunk = (chunk: unknown) => {
        pending += String(chunk);
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const text of lines) onLine(text);
      };

      child.stdout.on('data', onChunk);
      child.stderr.on('data', onChunk);
      child.on('error', error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`[signing-host] ${this.basePath} exited ${code} before serving`));
      });
    });
  }
}

/**
 * Provision the slot's identity if it does not exist yet, then stop.
 *
 * Starting the host is the only provisioning trigger: `exec '/session'` reports `User
 * <not provisioned>` and exits 0 without creating anything, so a warm-up built on it
 * would report success and warm nothing.
 *
 * Must not be interrupted — an aborted provisioning has already submitted its
 * registration and consumes a username suffix with no local trace.
 */
export async function warmSlot(opts: { basePath: string; network: string }): Promise<void> {
  const start = Date.now();
  const host = new SigningHost(opts.basePath);
  try {
    await host.start(opts.network);
    console.info(`[signing-host] ${opts.basePath} ready in ${Math.round((Date.now() - start) / 1000)}s`);
  } finally {
    await host.stop();
  }
}
