// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmationProvider } from '@/shared/components';
import { TranslationProvider } from '@/shared/translation';
import { SSODialog } from '../ui/SSODialog';

import { useEnsureProductSubtree, useProductSubtreeGate } from './productSubtree';

const readPersistedProductSubtree = vi.hoisted(() => vi.fn());
const requestProductSubtree = vi.hoisted(() => vi.fn());
vi.mock('@/domains/product', () => ({
  productAccountUseCase: { readPersistedProductSubtree, requestProductSubtree },
  // The subtree step names the product it is asking about; these back that header.
  useDisplayedProduct: () => ({ data: null }),
  useProductIcon: () => ({ data: null }),
  useDotNsTld: () => ({ data: '.dot', pending: false }),
}));

const SUBTREE_KEY = new Uint8Array(32).fill(9);

const session = { id: 's1', abortPendingRequests: () => ({ mapErr: () => undefined }) } as any;

/**
 * Fires `ensure` `count` times in a SINGLE tick. Sequential calls would prove nothing about
 * sharing — the first settles and clears the in-flight entry before the next one starts.
 */
const Caller = ({ count, onSettled }: { count: number; onSettled: (result: string) => void }) => {
  const ensure = useEnsureProductSubtree();

  return (
    <button
      type="button"
      onClick={() => {
        for (let i = 0; i < count; i++) {
          ensure(session, 'demo.dot').then(
            () => onSettled('resolved'),
            () => onSettled('rejected'),
          );
        }
      }}
    >
      go
    </button>
  );
};

const renderCallers = (count: number, onSettled: (result: string) => void) =>
  render(
    <TranslationProvider>
      <ConfirmationProvider>
        <Caller count={count} onSettled={onSettled} />
      </ConfirmationProvider>
    </TranslationProvider>,
  );

const clickAll = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'go' }));
};

describe('useEnsureProductSubtree', () => {
  beforeEach(() => {
    readPersistedProductSubtree.mockReset();
    requestProductSubtree.mockReset();
  });

  it('resolves from persistence without opening the modal', async () => {
    readPersistedProductSubtree.mockResolvedValue(SUBTREE_KEY);
    const onSettled = vi.fn();

    renderCallers(1, onSettled);
    await clickAll();

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('resolved'));
    expect(requestProductSubtree).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the modal exactly once on a miss', async () => {
    readPersistedProductSubtree.mockResolvedValue(null);
    requestProductSubtree.mockResolvedValue(SUBTREE_KEY);
    const onSettled = vi.fn();

    renderCallers(1, onSettled);
    await clickAll();

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('resolved'));
    expect(requestProductSubtree).toHaveBeenCalledTimes(1);
  });

  it('shares one request across concurrent callers for the same product', async () => {
    readPersistedProductSubtree.mockResolvedValue(null);
    requestProductSubtree.mockResolvedValue(SUBTREE_KEY);
    const onSettled = vi.fn();

    renderCallers(3, onSettled);
    await clickAll();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(3));
    // One modal, one device round trip — not three. A shared confirmation id would
    // instead have rejected the first two callers with "was replaced".
    expect(requestProductSubtree).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalledWith('rejected');
  });

  it('re-asks after a rejection instead of caching it', async () => {
    readPersistedProductSubtree.mockResolvedValue(null);
    requestProductSubtree.mockRejectedValue(new Error('rejected on device'));
    const onSettled = vi.fn();

    renderCallers(1, onSettled);
    await clickAll();
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('rejected'));

    // Nothing sticky: the next attempt opens the modal again.
    readPersistedProductSubtree.mockResolvedValue(SUBTREE_KEY);
    await clickAll();

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('resolved'));
  });
});

/**
 * Mirrors how the four SSO modals consume the gate: one `SSODialog.Root`, whose content is the
 * step the hook hands back until the key resolves.
 */
const GateHost = ({ enabled }: { enabled?: boolean }) => {
  const { requestStep } = useProductSubtreeGate(session, 'demo.dot', { onReject: vi.fn(), enabled });

  return <SSODialog.Root>{requestStep ?? <span data-testid="screen">review</span>}</SSODialog.Root>;
};

const renderHost = (enabled?: boolean) =>
  render(
    <TranslationProvider>
      <ConfirmationProvider>
        <GateHost enabled={enabled} />
      </ConfirmationProvider>
    </TranslationProvider>,
  );

describe('useProductSubtreeGate', () => {
  beforeEach(() => {
    readPersistedProductSubtree.mockReset();
    requestProductSubtree.mockReset();
  });

  it('goes straight to review from a persisted key, without ever arming the request', async () => {
    readPersistedProductSubtree.mockResolvedValue(SUBTREE_KEY);

    renderHost();

    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('review'));
    // The warm path must never arm the request — that is what keeps this from becoming a
    // per-signature prompt.
    expect(requestProductSubtree).not.toHaveBeenCalled();
  });

  it('arms the step when nothing is persisted', async () => {
    readPersistedProductSubtree.mockResolvedValue(null);
    requestProductSubtree.mockReturnValue(new Promise(() => {}));

    renderHost();

    await waitFor(() => expect(requestProductSubtree).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('screen')).toBeNull();
  });

  it('goes straight to review without reading persistence when disabled', async () => {
    renderHost(false);

    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('review'));
    expect(readPersistedProductSubtree).not.toHaveBeenCalled();
  });

  it('treats a failed persistence read as a missing key rather than hanging', async () => {
    readPersistedProductSubtree.mockRejectedValue(new Error('idb unavailable'));
    requestProductSubtree.mockReturnValue(new Promise(() => {}));

    renderHost();

    await waitFor(() => expect(requestProductSubtree).toHaveBeenCalledTimes(1));
  });

  it('never shows the review screen before the persistence read resolves', async () => {
    requestProductSubtree.mockReturnValue(new Promise(() => {}));
    let resolveRead: (key: Uint8Array | null) => void = () => {};
    readPersistedProductSubtree.mockReturnValue(
      new Promise<Uint8Array | null>(resolve => {
        resolveRead = resolve;
      }),
    );

    renderHost();

    // Arming on the read's result alone would regress to 'review' here, flashing the signing
    // screen before the flow's first step.
    expect(await screen.findByText(/checking this product/i)).toBeTruthy();
    expect(requestProductSubtree).not.toHaveBeenCalled();

    resolveRead(null);
    await waitFor(() => expect(requestProductSubtree).toHaveBeenCalledTimes(1));
  });
});
