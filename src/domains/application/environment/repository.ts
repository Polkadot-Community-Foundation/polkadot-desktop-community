import { SETTINGS_STORAGE_KEY } from './constants';

// Read the raw key directly: the active channel id is needed at module init,
// before the storage adapter hydrates.
const LOCAL_STORAGE_VALUE_KEY = `polkadot_${SETTINGS_STORAGE_KEY}_value`;

// Raw persisted environment id (unvalidated) or `null` when absent/unreadable.
// Validation against the known channels + the default fallback live in
// `environmentUseCase.getActiveId`.
function readPersistedEnvironmentId(): string | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_VALUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.environmentId === 'string') {
        return parsed.environmentId;
      }
    }
  } catch (e) {
    console.error('[environment] failed to read settings', e);
  }
  return null;
}

export const environmentRepository = {
  readPersistedEnvironmentId,
};
