import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `constants.ts` reads `VITE_ENVIRONMENTS` at import (unset in unit env), so mock
// it to just the storage key — this spec exercises only the localStorage read.
vi.mock('./constants', () => ({ SETTINGS_STORAGE_KEY: 'pb:settings' }));

import { environmentRepository } from './repository';

const KEY = 'polkadot_pb:settings_value';

// Node env (.spec.ts) has no localStorage — stub a minimal Map-backed one.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('environmentRepository.readPersistedEnvironmentId', () => {
  it('returns the persisted environmentId when present', () => {
    localStorage.setItem(KEY, JSON.stringify({ environmentId: 'staging' }));
    expect(environmentRepository.readPersistedEnvironmentId()).toBe('staging');
  });

  it('returns null when the key is absent', () => {
    expect(environmentRepository.readPersistedEnvironmentId()).toBeNull();
  });

  it('returns null when the stored value has no environmentId', () => {
    localStorage.setItem(KEY, JSON.stringify({ somethingElse: true }));
    expect(environmentRepository.readPersistedEnvironmentId()).toBeNull();
  });

  it('returns null (and does not throw) on malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(environmentRepository.readPersistedEnvironmentId()).toBeNull();
  });
});
