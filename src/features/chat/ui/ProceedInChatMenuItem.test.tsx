// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openChatRoomMock = vi.fn();
const openChatTabMock = vi.fn();
const commitRunMock = vi.fn((_productId: string) => of<{ baseName: string } | null>({ baseName: 'my-app.dot' }));
const toastErrorMock = vi.fn();
const useProductRoomsMock = vi.fn(() => ({ data: [] as { sessionId: string; roomId: string }[], pending: false, error: null }));

vi.mock('../hooks/useOpenProductChatRoom', () => ({
  useOpenProductChatRoom: () => openChatRoomMock,
}));

vi.mock('../hooks/useOpenChatTab', () => ({
  useOpenChatTab: () => openChatTabMock,
}));

vi.mock('@/domains/chat', () => ({
  useProductRooms: () => useProductRoomsMock(),
}));

vi.mock('@/domains/product', () => ({
  useCommitProductByIdentifier: () => ({ run: commitRunMock, pending: false, status: 'idle' }),
  useDisplayedProduct: (productId: string) => ({
    data: {
      baseName: productId,
      displayName: 'My App',
      executables: { worker: { includes: { chat: true } } },
    },
    pending: false,
    error: null,
  }),
}));

vi.mock('@novasamatech/tr-ui', async () => {
  const actual = await vi.importActual<object>('@novasamatech/tr-ui');

  return { ...actual, toastError: (...args: unknown[]) => toastErrorMock(...args) };
});

vi.mock('@/features/product-actions-menu', () => ({
  MenuItem: ({ label, onSelect }: { label: ReactNode; onSelect: () => void }) => <button onClick={onSelect}>{label}</button>,
}));

import { TranslationProvider } from '@/shared/translation';

import { ProceedInChatMenuItem } from './ProceedInChatMenuItem';

const PRODUCT_ID = 'my-app.dot';

const renderItem = () =>
  render(
    <TranslationProvider>
      <ProceedInChatMenuItem productId={PRODUCT_ID} closeMenu={vi.fn()} />
    </TranslationProvider>,
  );

describe('ProceedInChatMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProductRoomsMock.mockReturnValue({ data: [], pending: false, error: null });
    commitRunMock.mockReturnValue(of({ baseName: PRODUCT_ID }));
  });

  it('navigates directly to the chat room when it already exists', async () => {
    useProductRoomsMock.mockReturnValue({
      data: [{ sessionId: '0xsession', roomId: 'my-app' }],
      pending: false,
      error: null,
    });
    renderItem();

    await userEvent.click(screen.getByRole('button'));

    expect(openChatRoomMock).toHaveBeenCalledWith('0xsession');
    expect(commitRunMock).not.toHaveBeenCalled();
  });

  it('opens the chat tab and commits the product when no room exists yet', async () => {
    renderItem();

    await userEvent.click(screen.getByRole('button'));

    expect(openChatTabMock).toHaveBeenCalled();
    expect(commitRunMock).toHaveBeenCalledWith(PRODUCT_ID);
    expect(openChatRoomMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('surfaces an error when the product cannot be resolved, so no room will ever arrive', async () => {
    commitRunMock.mockReturnValue(of(null));
    renderItem();

    await userEvent.click(screen.getByRole('button'));

    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('surfaces an error when the commit itself fails', async () => {
    commitRunMock.mockReturnValue(throwError(() => new Error('offline')));
    renderItem();

    await userEvent.click(screen.getByRole('button'));

    expect(toastErrorMock).toHaveBeenCalled();
  });
});
