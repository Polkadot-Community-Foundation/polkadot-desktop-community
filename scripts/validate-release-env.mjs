/**
 * Fails the build before packaging when the release `.env` would ship a misconfigured installer:
 *   - VITE_ENVIRONMENTS must be valid JSON with exactly one channel, the declared default
 *     (more than one renders the network chooser)
 *   - the Firebase web ids Remote Config needs must be set
 * Values in `process.env` take precedence over the file, as they do for Vite. Pass an expected
 * channel id (arg 2 or EXPECTED_CHANNEL) to pin it.
 *
 * Usage:
 *   node scripts/validate-release-env.mjs [envPath=.env] [expectedChannel]
 * Exit code 0 = OK, 1 = misconfigured (with a human-readable reason on stderr).
 */
import { readFileSync } from 'node:fs';

const envPath = process.argv[2] ?? '.env';
const expectedChannel = process.argv[3] ?? process.env.EXPECTED_CHANNEL ?? '';

// The Firebase web ids src/bootstrap.ts reads to bootstrap Remote Config.
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

/** `process.env` first, as Vite does, then the file. A missing file alone is not fatal. */
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
