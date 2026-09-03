// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeSyncer } from './ThemeSyncer';

const setMode = vi.fn();
vi.mock('@novasamatech/tr-ui', () => ({
  useTheme: () => ({ setMode }),
}));

const browserTheme = vi.fn();
vi.mock('@/shared/hooks', () => ({
  useBrowserTheme: () => browserTheme(),
}));

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.colorScheme = '';
});

describe('ThemeSyncer', () => {
  it('binds the host color-scheme to the resolved app theme', () => {
    browserTheme.mockReturnValue('dark');

    render(<ThemeSyncer />);

    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(setMode).toHaveBeenCalledWith('dark');
  });

  it('follows a light resolved theme too', () => {
    browserTheme.mockReturnValue('light');

    render(<ThemeSyncer />);

    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
