// @vitest-environment happy-dom

import { type UserSession } from '@novasamatech/host-papp';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { TranslationProvider } from '@/shared/translation';

import { SignVrfModal } from './SignVrfModal';

const encode = (text: string) => new TextEncoder().encode(text);

// Never settles: the request stays in flight, so the waiting-on-mobile step stays on screen.
const pendingSession = () =>
  ({ signVrf: vi.fn(() => ResultAsync.fromSafePromise(new Promise<never>(() => {}))) }) as unknown as UserSession;

const renderModal = (props?: Partial<Parameters<typeof SignVrfModal>[0]>) =>
  render(
    <TranslationProvider>
      <SignVrfModal
        session={pendingSession()}
        productIdentifier="casino.dot"
        productAccountId={['lottery.dot', { tag: 'Index', value: 0 }]}
        transcriptLabel={encode('polkadot-lottery-v1')}
        items={[
          { label: encode('round'), value: encode('42') },
          { label: encode('ticket'), value: new Uint8Array([0x9f, 0x12, 0xab]) },
        ]}
        onResult={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </TranslationProvider>,
  );

describe('SignVrfModal', () => {
  it('names the requesting product in the title, not the account owner', () => {
    renderModal();
    expect(screen.getByText('Allow casino.dot to create a verifiable random signature?')).toBeTruthy();
    expect(screen.getByText('By allowing this, this app can generate a VRF signature signed on your behalf')).toBeTruthy();
  });

  it('discloses the signing account as its derivation path', () => {
    renderModal();
    expect(screen.getByText('//product//lottery.dot/0')).toBeTruthy();
  });

  it('discloses the transcript, hex-encoding values that are not printable text', () => {
    renderModal();
    expect(screen.getByText('polkadot-lottery-v1')).toBeTruthy();
    expect(screen.getByText('round')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('ticket')).toBeTruthy();
    expect(screen.getByText('0x9f12ab')).toBeTruthy();
  });

  it('signs the reviewed transcript and waits on the paired device', async () => {
    const session = pendingSession();
    renderModal({ session });

    await userEvent.click(screen.getByRole('button', { name: /^allow$/i }));

    expect(session.signVrf).toHaveBeenCalledWith({
      productAccountId: ['lottery.dot', { tag: 'Index', value: 0 }],
      productId: 'casino.dot',
      transcriptLabel: encode('polkadot-lottery-v1'),
      items: [
        { label: encode('round'), value: encode('42') },
        { label: encode('ticket'), value: new Uint8Array([0x9f, 0x12, 0xab]) },
      ],
    });
    expect(screen.queryByText('//product//lottery.dot/0')).toBeNull();
  });

  it('rejects when the review step is dismissed', async () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });

    await userEvent.click(screen.getByRole('button', { name: /don't allow/i }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
