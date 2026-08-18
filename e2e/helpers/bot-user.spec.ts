import { describe, expect, it } from 'vitest';

import {
  OS_SUFFIX,
  isAttestPendingResponse,
  isAttestRetriableResponse,
  isPermanentBotUsername,
  isTransientResponse,
  permanentBotUsername,
} from './bot-user';

const response = (status: number, body = ''): Response => new Response(body, { status });

const ON_CHAIN_TIMEOUT_BODY = JSON.stringify({
  error:
    'On-chain confirmation timed out for "testbot.68" on paseo-next-v2: Resources.Consumers entry missing after polling. Backend API accepted the registration but the on-chain extrinsic did not land. Retry attestation or check the identity backend.',
});

describe('isTransientResponse (create — idempotent by name, blind re-POST is safe)', () => {
  it('retries Cloudflare gateway errors', async () => {
    for (const status of [502, 503, 504]) {
      expect(await isTransientResponse(response(status))).toBe(true);
    }
  });

  it('retries Cloudflare origin-timeout (524)', async () => {
    expect(await isTransientResponse(response(524, '<!DOCTYPE html>...'))).toBe(true);
  });

  it('retries a 500 that signals a transient on-chain-confirmation timeout', async () => {
    expect(await isTransientResponse(response(500, ON_CHAIN_TIMEOUT_BODY))).toBe(true);
  });

  it('does NOT retry a generic 500 without the on-chain-timeout signature', async () => {
    expect(await isTransientResponse(response(500, JSON.stringify({ error: 'null pointer' })))).toBe(false);
  });

  it('does NOT retry success or non-transient client errors', async () => {
    for (const status of [200, 201, 400, 401, 404, 409]) {
      expect(await isTransientResponse(response(status))).toBe(false);
    }
  });

  it('leaves the original response body readable after peeking (uses a clone)', async () => {
    const res = response(500, 'On-chain confirmation timed out; retry attestation');
    await isTransientResponse(res);
    // The caller still needs to read the body for its error message.
    await expect(res.text()).resolves.toContain('retry attestation');
  });
});

describe('isAttestRetriableResponse (attest — blind re-POST only when the origin never processed)', () => {
  it('retries only 502/503', async () => {
    expect(await isAttestRetriableResponse(response(502))).toBe(true);
    expect(await isAttestRetriableResponse(response(503))).toBe(true);
  });

  it('does NOT blindly retry edge timeouts — the origin may still land the registration', async () => {
    // A blind re-POST here double-registers the lite username ("name.15" +
    // "name.34"), which broke contact search on every platform.
    expect(await isAttestRetriableResponse(response(504))).toBe(false);
    expect(await isAttestRetriableResponse(response(524))).toBe(false);
    expect(await isAttestRetriableResponse(response(500, ON_CHAIN_TIMEOUT_BODY))).toBe(false);
  });
});

describe('isAttestPendingResponse (attest — poll instead of re-POST)', () => {
  it('treats edge timeouts as submitted-pending', async () => {
    expect(await isAttestPendingResponse(response(504))).toBe(true);
    expect(await isAttestPendingResponse(response(524, '<!DOCTYPE html>...'))).toBe(true);
  });

  it('treats the explicit on-chain-timeout 500 as submitted-pending', async () => {
    expect(await isAttestPendingResponse(response(500, ON_CHAIN_TIMEOUT_BODY))).toBe(true);
  });

  it('does NOT treat genuine failures as pending', async () => {
    for (const status of [400, 401, 404, 409, 502, 503]) {
      expect(await isAttestPendingResponse(response(status))).toBe(false);
    }
    expect(await isAttestPendingResponse(response(500, JSON.stringify({ error: 'null pointer' })))).toBe(false);
  });

  it('leaves the original response body readable after peeking (uses a clone)', async () => {
    const res = response(500, ON_CHAIN_TIMEOUT_BODY);
    await isAttestPendingResponse(res);
    await expect(res.text()).resolves.toContain('Retry attestation');
  });
});

describe('permanentBotUsername', () => {
  it('appends the OS suffix to the base', () => {
    expect(permanentBotUsername('desktopauth')).toBe(`desktopauth${OS_SUFFIX}`);
  });

  it('inserts the worker letter between base and OS suffix', () => {
    expect(permanentBotUsername('desktopauthd', 0)).toBe(`desktopauthda${OS_SUFFIX}`);
    expect(permanentBotUsername('desktopsdk', 3)).toBe(`desktopsdkd${OS_SUFFIX}`);
  });

  it('rejects a base without the permanent prefix', () => {
    expect(() => permanentBotUsername('testbotfoo')).toThrow(/desktop/);
  });

  it('rejects out-of-range worker indexes', () => {
    expect(() => permanentBotUsername('desktopauthd', 26)).toThrow(/worker/i);
    expect(() => permanentBotUsername('desktopauthd', -1)).toThrow(/worker/i);
  });

  it('rejects bases that break the username charset', () => {
    expect(() => permanentBotUsername('desktop-auth')).toThrow(/\[a-z\]/);
  });
});

describe('isPermanentBotUsername', () => {
  it('recognises the desktop prefix', () => {
    expect(isPermanentBotUsername(`desktopauth${OS_SUFFIX}`)).toBe(true);
    expect(isPermanentBotUsername('testbotabcdefghij')).toBe(false);
  });
});
