// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TEST_IDS } from '@/shared/test-ids';
import { TranslationProvider } from '@/shared/translation';

import { MessageInput } from './MessageInput';

const renderInput = (props: Partial<Parameters<typeof MessageInput>[0]> = {}) =>
  render(
    <TranslationProvider>
      <MessageInput submitAction={vi.fn().mockResolvedValue(undefined)} {...props} />
    </TranslationProvider>,
  );

describe('MessageInput', () => {
  it('disables the textarea and hides the send button when disabled', () => {
    renderInput({ disabled: true });

    const textarea = screen.getByTestId(TEST_IDS.chatMessageInput);
    expect(textarea).toBeDisabled();
    expect(screen.queryByTestId(TEST_IDS.chatSendButton)).toBeNull();
  });

  it('keeps the send button hidden even after typing when disabled', () => {
    renderInput({ disabled: true });

    fireEvent.change(screen.getByTestId(TEST_IDS.chatMessageInput), { target: { value: 'hello' } });

    expect(screen.queryByTestId(TEST_IDS.chatSendButton)).toBeNull();
  });

  it('shows the send button after typing when enabled', () => {
    renderInput();

    fireEvent.change(screen.getByTestId(TEST_IDS.chatMessageInput), { target: { value: 'hello' } });

    expect(screen.getByTestId(TEST_IDS.chatSendButton)).toBeInTheDocument();
  });
});
