import { useEffect, useState } from 'react';

export type ThemeName = 'berlin' | 'tokyo' | 'lisbon' | 'malta';

export const THEME_NAMES: ThemeName[] = ['berlin', 'tokyo', 'lisbon', 'malta'];

const DEFAULT_THEME_NAME: ThemeName = 'berlin';
const THEME_NAME_STORAGE_KEY = 'polkadot_theme_name';
const THEME_NAME_CHANGE_EVENT = 'polkadot-theme-name-change';

const isThemeName = (value: unknown): value is ThemeName => typeof value === 'string' && THEME_NAMES.some(name => name === value);

export const readThemeName = (): ThemeName => {
  try {
    const saved = localStorage.getItem(THEME_NAME_STORAGE_KEY);
    return isThemeName(saved) ? saved : DEFAULT_THEME_NAME;
  } catch {
    return DEFAULT_THEME_NAME;
  }
};

export const saveThemeName = (name: ThemeName) => {
  try {
    localStorage.setItem(THEME_NAME_STORAGE_KEY, name);
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new CustomEvent(THEME_NAME_CHANGE_EVENT));
};

export const useThemeName = (): ThemeName => {
  const [name, setName] = useState<ThemeName>(readThemeName);

  useEffect(() => {
    const sync = () => setName(readThemeName());
    window.addEventListener(THEME_NAME_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(THEME_NAME_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return name;
};
