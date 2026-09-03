/**
 * Release env guard — fails the build BEFORE packaging if the generated `.env` would
 * produce an unsafe or misconfigured desktop installer.
 *
 * The public DEV distribution must ship EXACTLY ONE network channel. If more than one
 * channel is present the app renders a network chooser (OnboardingScreen + Settings →
 * Development), which must never reach end users. This guard is the deterministic
 * backstop for that: it does not rely on `--mode production` alone.
 *
 * It reads the ephemeral `.env` the release workflow writes on the runner (never a
 * committed file), overlaid with `process.env` — Vite resolves process-env variables
 * ahead of the `.env` file, so that is the value the build actually compiles. Reading the
 * file alone would silently pass a near-empty `.env` while the build compiled a
 * different, unvalidated catalog injected through a step-level `env:` block (which is how
 * upstream's `release-pipeline.yml` feeds its build — it writes no `.env` at all).
 *
 * It asserts:
 *   - VITE_ENVIRONMENTS is present, valid JSON, and defines EXACTLY ONE channel
 *   - that channel is the declared default channel
 *   - the Firebase web ids required to bootstrap Remote Config are non-empty
 *
 * The channel id is NOT enforced by default: the single public DEV channel targets the
 * devnet and its catalog id ("paseo") is incidental. Pass an expected id (arg 2 or
 * EXPECTED_CHANNEL) only if you want to pin it.
 *
 * Usage:
 *   node scripts/validate-release-env.mjs [envPath=.env] [expectedChannel]
 * Exit code 0 = OK, 1 = misconfigured (with a human-readable reason on stderr).
 */
import { readFileSync } from 'node:fs';

const envPath = process.argv[2] ?? '.env';
const expectedChannel = process.argv[3] ?? process.env.EXPECTED_CHANNEL ?? '';

// Firebase web ids the app needs to bootstrap Remote Config (which delivers the live
// Paseo chain wiring). A build missing these boots into a broken state.
//
// These are exactly the three `src/bootstrap.ts` reads. VITE_FIREBASE_AUTH_DOMAIN used to
// be asserted here too and is deliberately gone: it is read by nothing in `src/` or
// `main/` on either side of the sync, so requiring it could only ever produce a false
// release failure. VITE_FIREBASE_STORAGE_BUCKET and VITE_FIREBASE_MESSAGING_SENDER_ID are
// equally unread and equally not required.
const REQUIRED_KEYS = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];

function fail(msg) {
  console.error(`✗ release-env: ${msg}`);
  process.exit(1);
}

/** Minimal dotenv reader: first `=` splits key/value; strips one layer of matching quotes. */
function parseDotenv(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val.at(-1) === val[0]) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Resolve a key the way the build will: `process.env` first (Vite gives it precedence
 * over the `.env` file), then the file. A missing file is not fatal on its own — a
 * pipeline that injects everything through a step `env:` writes none — but a run where
 * NEITHER source carries the catalog still fails below on VITE_ENVIRONMENTS.
 */
let fileEnv = {};
let fileError = null;
try {
  fileEnv = parseDotenv(readFileSync(envPath, 'utf8'));
} catch (e) {
  fileError = e.message;
}

const read = key => {
  const fromProcess = process.env[key];
  return fromProcess !== undefined && fromProcess !== '' ? fromProcess : fileEnv[key];
};

const rawCatalog = read('VITE_ENVIRONMENTS');
if (!rawCatalog && fileError) fail(`cannot read ${envPath} (${fileError}) and VITE_ENVIRONMENTS is not in the environment either`);
if (!rawCatalog) fail('VITE_ENVIRONMENTS is missing or empty');

let catalog;
try {
  catalog = JSON.parse(rawCatalog);
} catch (e) {
  fail(`VITE_ENVIRONMENTS is not valid JSON: ${e.message}`);
}

const channels = Object.keys(catalog?.channels ?? {});
if (channels.length !== 1) {
  fail(`must ship EXACTLY ONE network channel; got ${channels.length}: [${channels.join(', ')}]`);
}
const only = channels[0];
if (catalog.default !== only) {
  fail(`default channel must be the single channel "${only}"; got default "${catalog.default}"`);
}
if (expectedChannel && only !== expectedChannel) {
  fail(`expected the "${expectedChannel}" channel; got "${only}"`);
}

const missing = REQUIRED_KEYS.filter(k => !read(k));
if (missing.length) fail(`missing required Firebase ids: ${missing.join(', ')}`);

// Non-fatal advisories — the build still ships, but flag gaps operators usually want.
for (const [key, note] of [
  ['VITE_WEBRTC_TURN_SECRET', 'WebRTC TURN relay disabled (P2P may fail behind symmetric NAT)'],
  ['SENTRY_DSN', 'crash reporting disabled'],
]) {
  if (!read(key)) console.warn(`⚠ release-env: ${key} unset — ${note}`);
}

console.log(`✓ release-env: single channel "${channels[0]}", Firebase ids present`);
