// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readLocale, saveLocale, useLocalePreference } from './localePreference';

const STORAGE_KEY = 'polkadot_locale';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readLocale', () => {
  it('defaults to en when nothing is stored', () => {
    expect(readLocale()).toBe('en');
  });

  it('returns a stored supported locale', () => {
    localStorage.setItem(STORAGE_KEY, 'ja');

    expect(readLocale()).toBe('ja');
  });

  it('falls back to en when the stored value is not a supported locale', () => {
    localStorage.setItem(STORAGE_KEY, 'klingon');

    expect(readLocale()).toBe('en');
  });

  it('falls back to en when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(readLocale()).toBe('en');
  });
});

describe('saveLocale', () => {
  it('persists the locale', () => {
    saveLocale('fr');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('fr');
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => saveLocale('fr')).not.toThrow();
  });
});

describe('useLocalePreference', () => {
  it('returns the persisted locale', () => {
    localStorage.setItem(STORAGE_KEY, 'de');

    const { result } = renderHook(() => useLocalePreference());

    expect(result.current).toBe('de');
  });

  it('re-reads when the locale changes elsewhere', () => {
    const { result } = renderHook(() => useLocalePreference());
    expect(result.current).toBe('en');

    act(() => saveLocale('ru'));

    expect(result.current).toBe('ru');
  });
});
