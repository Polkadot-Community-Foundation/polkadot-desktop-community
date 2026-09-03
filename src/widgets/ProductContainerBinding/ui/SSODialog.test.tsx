// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renewalStatus = vi.fn();
const cancel = vi.fn();

vi.mock('@/aggregates/allowance-renewal', () => ({
  useAllowanceRenewalStatus: () => renewalStatus(),
  allowanceRenewalUseCase: { cancel: () => cancel() },
}));

vi.mock('@/domains/application', () => ({
  useSubmitError: () => null,
}));

// Only `requestProductSubtree` is exercised here. Mocking the whole barrel would pull
// `@/domains/product/bootstrap` -> `@/domains/application` -> Dexie construction into
// happy-dom; mocking the use-case module directly keeps this a component test.
const requestProductSubtree = vi.hoisted(() => vi.fn());
// `useDisplayedProduct` / `useProductIcon` back the product header the subtree step
// renders; an unresolved product falls back to the identifier, which is what these
// tests exercise.
vi.mock('@/domains/product', () => ({
  productAccountUseCase: { requestProductSubtree },
  useDisplayedProduct: () => ({ data: null }),
  useProductIcon: () => ({ data: null }),
  useDotNsTld: () => ({ data: '.dot', pending: false }),
}));

import { TranslationProvider } from '@/shared/translation';

import { SSODialog } from './SSODialog';

const session = {
  abortPendingRequests: () => ({ mapErr: () => undefined }),
};

type WaitingProps = ComponentProps<typeof SSODialog.WaitingForMobile>;

const waitingProps: WaitingProps = {
  lifetimeMs: 240_000,
  // Structural stub for the only session member the step touches.
  session: session as never,
  onAbort: vi.fn(),
};

const renderWaiting = (overrides: Partial<WaitingProps> = {}) =>
  render(
    <TranslationProvider>
      <SSODialog.Root onDismiss={vi.fn()}>
        <SSODialog.WaitingForMobile {...waitingProps} {...overrides} />
      </SSODialog.Root>
    </TranslationProvider>,
  );

describe('SSODialog.WaitingForMobile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renewalStatus.mockReturnValue('idle');
    cancel.mockReset();
  });

  it('renders the signing copy by default', () => {
    renderWaiting();

    expect(screen.getByText('Sign Transaction')).toBeTruthy();
    expect(screen.queryByText('Open Mobile App')).toBeNull();
  });

  it('renders the allocation copy for the allocation variant', () => {
    renderWaiting({ variant: 'allocation' });

    expect(screen.getByText('Allowance request')).toBeTruthy();
  });

  it('overrides the caller variant with the renewal copy while renewing', () => {
    renewalStatus.mockReturnValue('waiting');

    renderWaiting({ variant: 'allocation' });

    expect(screen.getByText('Open Mobile App')).toBeTruthy();
    expect(screen.getByText('Make sure you have the Polkadot app installed,')).toBeTruthy();
    expect(screen.getByText('then open it to continue')).toBeTruthy();
    expect(screen.queryByText('Allowance request')).toBeNull();
  });

  it('shows no countdown and never times out while renewing', () => {
    renewalStatus.mockReturnValue('waiting');
    const onAbort = vi.fn();

    renderWaiting({ onAbort });
    vi.advanceTimersByTime(300_000);

    expect(screen.queryByText(/Valid for/)).toBeNull();
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('registers its dismiss handler without invoking it on mount', () => {
    // Regression: `setDismissOverride(() => handler())` reads as a functional
    // state updater and fires on mount, aborting the request as the step appears.
    const onAbort = vi.fn();

    renderWaiting({ onAbort });

    expect(onAbort).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('throws a named error when rendered outside Root', () => {
    // The context guard is what keeps a step from mounting its own dialog.
    expect(() => render(<SSODialog.WaitingForMobile {...waitingProps} />)).toThrow(/must be rendered inside SSODialog.Root/);
  });
});

type SubtreeProps = ComponentProps<typeof SSODialog.RequestingProductSubtree>;

const SUBTREE_KEY = new Uint8Array(32).fill(9);

const renderSubtree = (overrides: Partial<SubtreeProps> = {}) => {
  const props: SubtreeProps = {
    session: session as never,
    productIdentifier: 'demo.dot',
    onResult: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };

  const ui = (next: Partial<SubtreeProps> = {}) => (
    <TranslationProvider>
      <SSODialog.Root>
        <SSODialog.RequestingProductSubtree {...props} {...next} />
      </SSODialog.Root>
    </TranslationProvider>
  );

  const { rerender } = render(ui());

  return { rerenderWith: (next: Partial<SubtreeProps>) => rerender(ui(next)) };
};

describe('SSODialog.RequestingProductSubtree', () => {
  beforeEach(() => {
    // userEvent drives real timers; the waiting-step suites above install fake ones.
    vi.useRealTimers();
    renewalStatus.mockReturnValue('idle');
    requestProductSubtree.mockReset();
  });

  it('fires the subtree request on mount without any user action', async () => {
    requestProductSubtree.mockResolvedValue(SUBTREE_KEY);
    const onResult = vi.fn();

    renderSubtree({ onResult });

    await waitFor(() => expect(requestProductSubtree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(SUBTREE_KEY));
  });

  it('rejects the caller when the user dismisses the request', async () => {
    requestProductSubtree.mockReturnValue(new Promise(() => {}));
    const onReject = vi.fn();

    renderSubtree({ onReject });

    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(onReject).toHaveBeenCalled();
  });

  it('surfaces a failed request without resolving or rejecting on its own', async () => {
    requestProductSubtree.mockRejectedValue(new Error('rejected on device'));
    const onResult = vi.fn();
    const onReject = vi.fn();

    renderSubtree({ onResult, onReject });

    // The failure is shown and the user decides; the step never settles the caller itself.
    expect(await screen.findByText(/couldn't set up product accounts/i)).toBeTruthy();
    expect(onResult).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('rejects the caller when the user cancels after a failure', async () => {
    requestProductSubtree.mockRejectedValue(new Error('rejected on device'));
    const onReject = vi.fn();

    renderSubtree({ onReject });
    await screen.findByText(/couldn't set up product accounts/i);

    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(onReject).toHaveBeenCalled();
  });

  it('does not reach the device while unarmed', async () => {
    requestProductSubtree.mockResolvedValue(SUBTREE_KEY);

    renderSubtree({ armed: false });

    // The host mounts this step while it is still reading persistence; firing here would ask
    // the phone for a key that may already be stored.
    await screen.findByText(/checking this product/i);
    expect(requestProductSubtree).not.toHaveBeenCalled();
  });

  it('fires once when the host arms it, without remounting', async () => {
    requestProductSubtree.mockResolvedValue(SUBTREE_KEY);
    const onResult = vi.fn();

    const { rerenderWith } = renderSubtree({ armed: false, onResult });
    expect(requestProductSubtree).not.toHaveBeenCalled();

    rerenderWith({ armed: true });

    await waitFor(() => expect(requestProductSubtree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(SUBTREE_KEY));
  });

  it('registers its dismiss handler without invoking it on mount', () => {
    requestProductSubtree.mockReturnValue(new Promise(() => {}));
    const onReject = vi.fn();

    renderSubtree({ onReject });

    expect(onReject).not.toHaveBeenCalled();
  });
});

describe('SSODialog.Root', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renewalStatus.mockReturnValue('idle');
  });

  it('keeps ONE dialog across a step change instead of mounting a second', () => {
    const { rerender } = render(
      <TranslationProvider>
        <SSODialog.Root onDismiss={vi.fn()}>
          <SSODialog.Title>Review</SSODialog.Title>
        </SSODialog.Root>
      </TranslationProvider>,
    );

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(screen.getByText('Review')).toBeTruthy();

    rerender(
      <TranslationProvider>
        <SSODialog.Root onDismiss={vi.fn()}>
          <SSODialog.WaitingForMobile {...waitingProps} />
        </SSODialog.Root>
      </TranslationProvider>,
    );

    // Same single dialog — the step swapped the content, not the dialog.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(screen.getByText('Sign Transaction')).toBeTruthy();
    expect(screen.queryByText('Review')).toBeNull();
  });
});
