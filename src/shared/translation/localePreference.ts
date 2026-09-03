import { useEffect, useState } from 'react';

import { DEFAULT_LOCALE, LOCALE_IDS } from './constants';
import { type Locale } from './types';

const LOCALE_STORAGE_KEY = 'polkadot_locale';
const LOCALE_CHANGE_EVENT = 'polkadot-locale-change';

function isSupportedLocale(value: string | null): value is Locale {
  return value !== null && LOCALE_IDS.some(id => id === value);
}

export function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);

    return isSupportedLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable. localStorage is the only source of truth, so the selection
    // does not take effect and the radio snaps back — same as saveTheme in the same
    // situation.
  }
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT));
}

export const useLocalePreference = (): Locale => {
  const [locale, setLocale] = useState<Locale>(readLocale);

  useEffect(() => {
    const sync = () => setLocale(readLocale());
    window.addEventListener(LOCALE_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return locale;
};
