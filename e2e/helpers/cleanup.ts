import { type Page } from '@playwright/test';

import { DEFAULT_TIMEOUT } from './timeouts';

type BotPairingInfo = {
  clientId: string;
  sessionId: string;
  botUrl: string;
  botToken?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isBotPairingInfo = (value: unknown): value is BotPairingInfo => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['clientId'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['botUrl'] === 'string' &&
    (value['botToken'] === undefined || typeof value['botToken'] === 'string')
  );
};

/**
 * Clear all application data in the renderer process.
 * Should be called right after Electron launches, before any test actions.
 * Ensures a clean slate on every test run (no stale sessions, storage, etc.).
 */
export async function clearAppData(page: Page): Promise<void> {
  // Wait for the app to navigate away from about:blank, where localStorage is inaccessible
  await page.waitForURL(/^(?!about:blank)/, { timeout: DEFAULT_TIMEOUT });

  // Custom Electron protocols may have opaque origin — localStorage access can be
  // denied by Chromium even when the URL passes the about:blank guard. Each test
  // already runs in a fresh userDataDir so storage is clean; the evaluate is
  // best-effort defense against stale in-memory state on re-runs.
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* opaque origin — fresh userDataDir covers this */
    }
    try {
      sessionStorage.clear();
    } catch {
      /* opaque origin */
    }
    try {
      indexedDB.deleteDatabase('polkadot-desktop');
    } catch {
      /* opaque origin */
    }
    try {
      indexedDB.deleteDatabase('polkadot-desktop-product-storage');
    } catch {
      /* opaque origin */
    }
  });

  // Reload so the app starts fresh with empty state
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Disconnect bot sessions for the current pairing.
 * Reads clientId from window.__botPairingInfo (set by pairViaBotApi), falling
 * back to its localStorage mirror — the window property does not survive the
 * page.reload() the soft-reset and chat-state reset perform — then calls the
 * bot's disconnect endpoint from Node.js.
 */
export async function disconnectBotSession(page: Page): Promise<void> {
  const rawInfo = await page
    .evaluate(() => {
      const fromWindow = Reflect.get(window, '__botPairingInfo');
      if (fromWindow) return fromWindow;
      try {
        const stored = localStorage.getItem('__botPairingInfo');
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    })
    .catch(() => null);
  const info = isBotPairingInfo(rawInfo) ? rawInfo : null;
  if (!info?.clientId) {
    console.info('[CLEANUP] No bot pairing info found — skipping disconnect');
    return;
  }

  const { clientId, botUrl, botToken } = info;
  console.info(`[CLEANUP] Disconnecting bot sessions for clientId="${clientId}"...`);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (botToken) {
      headers['Authorization'] = `Bearer ${botToken}`;
    }

    const res = await fetch(`${botUrl}/api/disconnect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clientId }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const result = await res.json();
      console.info(`[CLEANUP] Bot disconnect: ${result.count} session(s) disconnected`);
    } else {
      console.warn(`[CLEANUP] Bot disconnect failed: ${res.status}`);
    }
  } catch (err) {
    console.warn('[CLEANUP] Bot disconnect error (best-effort):', err);
  }
}
