// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TranslationProvider } from '@/shared/translation';
import { type Product } from '@/domains/product';

const { onRefreshApplyMock } = vi.hoisted(() => ({
  onRefreshApplyMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/domains/product', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    productService: {
      ...(actual['productService'] as object),
      refreshTargetIdentifiers: () => new Set<string>(),
    },
  };
});

vi.mock('@/aggregates/product-loading', () => ({
  onProductRefreshRequestedSideEffect: {
    apply: onRefreshApplyMock,
  },
}));

vi.mock('@/shared/di', async importOriginal => ({
  ...(await importOriginal<object>()),
  useSideEffect: vi.fn(),
}));

vi.mock('@/shared/components', async importOriginal => ({
  ...(await importOriginal<object>()),
  WidgetLoadingScreen: () => <div data-testid="widget-loading">Loading...</div>,
}));

vi.mock('@/widgets/Webview', () => ({
  Webview: () => <div data-testid="webview-host">Webview</div>,
}));

import { ProductWidgetBody } from './ProductWidgetBody';

// Tests are exempt from the no-`as` rule; only the fields the body reads matter.
const someProduct = { baseName: 'app.dot' } as unknown as Product;

type BodyProps = {
  product?: Product | null;
  hasContent?: boolean;
  pending?: boolean;
  onRemoveCard?: VoidFunction;
};

const renderBody = ({ product = null, hasContent = false, pending = false, onRemoveCard = vi.fn() }: BodyProps = {}) =>
  render(
    <TranslationProvider>
      <ProductWidgetBody
        productId="app.dot"
        product={product}
        hasContent={hasContent}
        pending={pending}
        onRemoveCard={onRemoveCard}
      />
    </TranslationProvider>,
  );

describe('ProductWidgetBody placeholders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "widget not found" placeholder and removes card on action click', async () => {
    const user = userEvent.setup();
    const onRemoveCard = vi.fn();

    renderBody({ product: null, hasContent: false, pending: false, onRemoveCard });

    expect(screen.getByText('Widget does not exist anymore')).toBeTruthy();
    await user.click(screen.getByText('Delete widget'));
    expect(onRemoveCard).toHaveBeenCalledOnce();
  });

  it('renders "widget unavailable" placeholder and retries loading on action click', async () => {
    const user = userEvent.setup();

    renderBody({ product: someProduct, hasContent: false, pending: false });

    expect(screen.getByText('Widget is currently unavailable')).toBeTruthy();
    await user.click(screen.getByText('Retry'));
    expect(onRefreshApplyMock).toHaveBeenCalledWith({ identifier: 'app.dot' });
  });

  it('renders nothing (block pulse handles it) while phase-1 loading', () => {
    const { container } = renderBody({ product: someProduct, hasContent: false, pending: true });

    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('widget-loading')).toBeNull();
  });
});
