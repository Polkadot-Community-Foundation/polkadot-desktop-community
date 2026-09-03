// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductIdentity } from './ProductIdentity';

const product = vi.hoisted(() => ({ current: null as { displayName: string; icon: unknown } | null }));
const iconUrl = vi.hoisted(() => ({ current: null as string | null }));

vi.mock('@/domains/product', () => ({
  usePersistedProductById: () => ({ data: product.current, pending: false, error: null }),
  useProductIcon: () => ({ data: iconUrl.current, pending: false, error: null }),
}));

afterEach(() => {
  cleanup();
  product.current = null;
  iconUrl.current = null;
});

describe('ProductIdentity', () => {
  it('renders the answering product manifest name, not its identifier', () => {
    product.current = { displayName: 'Wallet', icon: {} };
    render(<ProductIdentity productId="dotli-wallet" />);

    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.queryByText('dotli-wallet')).toBeNull();
  });

  it('falls back to the identifier when the manifest is not on hand', () => {
    render(<ProductIdentity productId="dotli-wallet" />);

    expect(screen.getByText('dotli-wallet')).toBeInTheDocument();
  });

  it('renders the manifest icon with empty alt text, so the name is the only label', () => {
    // The name already carries the identity; a duplicate alt would make every
    // candidate announce its product twice.
    product.current = { displayName: 'Wallet', icon: {} };
    iconUrl.current = 'data:image/png;base64,AAAA';
    const { container } = render(<ProductIdentity productId="dotli-wallet" />);

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(image?.getAttribute('alt')).toBe('');
  });
});
