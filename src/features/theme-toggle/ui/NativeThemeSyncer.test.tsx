// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NativeThemeSyncer } from './NativeThemeSyncer';

const setPreference = vi.fn();
vi.mock('@/shared/hooks', () => ({
  useThemePreference: () => setPreference(),
}));

afterEach(() => {
  vi.clearAllMocks();
  // @ts-expect-error test cleanup of the optional bridge
  delete window.App;
});

describe('NativeThemeSyncer', () => {
  it('pushes the current preference to the native theme bridge on mount', () => {
    const setNativeTheme = vi.fn();
    // @ts-expect-error partial App bridge for the test
    window.App = { setNativeTheme };
    setPreference.mockReturnValue('dark');

    render(<NativeThemeSyncer />);

    expect(setNativeTheme).toHaveBeenCalledWith('dark');
  });

  it('does not throw when the bridge is absent (web build)', () => {
    setPreference.mockReturnValue('system');
    expect(() => render(<NativeThemeSyncer />)).not.toThrow();
  });
});
