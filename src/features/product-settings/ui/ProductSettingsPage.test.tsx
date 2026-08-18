// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { forgetProductMock, useDisplayedProductMock, useAllAliasPermissionsMock } = vi.hoisted(() => ({
  forgetProductMock: vi.fn(),
  useDisplayedProductMock: vi.fn(() => ({ data: null as unknown, pending: false, error: null })),
  useAllAliasPermissionsMock: vi.fn(() => ({ data: [] as unknown[] })),
}));

vi.mock('@novasamatech/tr-ui', () => {
  const Dialog = ({ open, children }: PropsWithChildren<{ open: boolean }>) => (open ? <div>{children}</div> : null);
  Dialog.Content = ({ children }: PropsWithChildren<{ showCloseButton?: boolean }>) => <div>{children}</div>;
  Dialog.Header = ({ children }: PropsWithChildren) => <div>{children}</div>;
  Dialog.Footer = ({ children }: PropsWithChildren) => <div>{children}</div>;
  Dialog.Title = ({ children }: PropsWithChildren) => <div>{children}</div>;
  Dialog.Description = ({ children }: PropsWithChildren) => <div>{children}</div>;
  Dialog.Close = ({ children }: PropsWithChildren<{ asChild?: boolean }>) => <div>{children}</div>;

  return {
    Dialog,
    Button: ({ children, onClick }: PropsWithChildren<{ onClick?: VoidFunction }>) => (
      <button onClick={onClick}>{children}</button>
    ),
    ScrollArea: ({ children }: PropsWithChildren) => <div>{children}</div>,
    toastSuccess: vi.fn(),
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/domains/product', () => ({
  useDisplayedProduct: useDisplayedProductMock,
  useOfflineCacheSize: () => 0,
  useProductPermissions: () => ({ data: null }),
  useAllAliasPermissions: useAllAliasPermissionsMock,
  lifecycleUseCase: { clearProductCache: vi.fn() },
  permissionsService: {
    // grant-wins roll-up, matching the real service contract.
    rollupPermissionStatus: (statuses: string[]) =>
      statuses.includes('granted') ? 'granted' : statuses.includes('denied') ? 'denied' : 'ask',
  },
  productService: { refreshTargetIdentifiers: () => new Set() },
}));

vi.mock('@/aggregates/product-loading', () => ({
  onProductRefreshRequestedSideEffect: { apply: vi.fn() },
}));

vi.mock('@/aggregates/product-management', () => ({
  useForgetProduct: () => ({ forgetProduct: forgetProductMock }),
}));

vi.mock('@/widgets/Permission', () => ({
  STATUS_LABEL_KEYS: {
    ask: 'feature.permissionSettings.status.ask',
    granted: 'feature.permissionSettings.status.granted',
    denied: 'feature.permissionSettings.status.denied',
  },
  getPermissionMeta: () => undefined,
}));

vi.mock('@/widgets/ProductIcon', () => ({
  ProductIcon: ({ fallback }: { fallback: ReactNode }) => <div>{fallback}</div>,
}));

import { TranslationProvider } from '@/shared/translation';

import { ProductSettingsPage } from './ProductSettingsPage';

const renderPage = (productId: string) =>
  render(
    <TranslationProvider>
      <ProductSettingsPage productId={productId} backLabel="Back" onBack={vi.fn()} />
    </TranslationProvider>,
  );

describe('ProductSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDisplayedProductMock.mockReturnValue({ data: null, pending: false, error: null });
    useAllAliasPermissionsMock.mockReturnValue({ data: [] });
  });

  it('forgets a permission-only product even when it cannot be resolved', async () => {
    const user = userEvent.setup();
    renderPage('localhost:5173');

    // Page-level button opens the dialog; the second 'Forget App' is the confirm.
    await user.click(screen.getByText('Forget App'));
    const confirm = screen.getAllByText('Forget App')[1]!;
    await user.click(confirm);

    expect(forgetProductMock).toHaveBeenCalledWith('localhost:5173');
  });

  it('renders the product description', () => {
    useDisplayedProductMock.mockReturnValue({
      data: { baseName: 'editor.dot', displayName: 'Editor', description: 'Lightweight editor' },
      pending: false,
      error: null,
    });
    renderPage('editor.dot');

    expect(screen.getByText('Lightweight editor')).toBeInTheDocument();
  });

  it('lists an alias permission stored as "ask" (allow-once) with the "Ask (Default)" status', () => {
    useAllAliasPermissionsMock.mockReturnValue({
      data: [
        {
          key: 'localhost:5173::dot',
          requesterProductId: 'localhost:5173',
          requestedContextId: 'dot',
          status: 'ask',
        },
      ],
    });

    renderPage('localhost:5173');

    expect(screen.getByText('Alias')).toBeInTheDocument();
    expect(screen.getByText('Ask (Default)')).toBeInTheDocument();
    expect(screen.queryByText('Denied')).not.toBeInTheDocument();
  });
});
