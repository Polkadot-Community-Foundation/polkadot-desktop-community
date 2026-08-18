// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TranslationProvider } from '@/shared/translation';

import { ChatSettingsPage } from './ChatSettingsPage';

const runMock = vi.fn();
vi.mock('@/domains/chat', () => ({
  useHideRequestsByDefault: () => ({ data: true, pending: false }),
  useSetHideRequestsByDefault: () => ({ run: runMock }),
}));

describe('ChatSettingsPage', () => {
  it('reflects the preference and toggles it off', async () => {
    render(
      <TranslationProvider>
        <ChatSettingsPage />
      </TranslationProvider>,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    expect(runMock).toHaveBeenCalledWith({ value: false });
  });
});
