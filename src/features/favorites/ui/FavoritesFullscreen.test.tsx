// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { removeItemFromFolder, apply, state } = vi.hoisted(() => ({
  removeItemFromFolder: vi.fn(),
  apply: vi.fn(),
  state: {
    favoriteIds: new Set<string>(['coinflip', 'staking']),
  },
}));

vi.mock('@/domains/application', () => ({
  useFavoriteProductIds: () => ({ data: state.favoriteIds }),
  useAddToFavorites: () => ({ addToFavorites: vi.fn() }),
  useRemoveItemFromFolder: () => ({ removeItemFromFolder }),
}));
vi.mock('@/domains/product', () => ({
  // Each favourite id resolves to a product (committed-or-chain) for its icon.
  useDisplayedProduct: (id: string | null) => ({ data: id ? { baseName: id, icon: null } : null }),
  useProductIcon: () => ({ data: null }),
  dotNsService: { toShortLabel: (id: string) => id },
  useDotNsTld: () => ({ data: '.dot', pending: false, error: null, refresh: vi.fn() }),
  useDotNsLabels: () => ({
    displayName: (name: string) => name.replace(/\.dot$/, ''),
    shortLabel: (name: string) => name.replace(/\.dot$/, ''),
  }),
  // The always-mounted AddToFavoritesDialog reads the SPA catalog; keep it empty here.
  usePublishedAppListings: () => ({ data: [], pending: false, error: null, refresh: vi.fn() }),
  browseService: { productPreviewFromListing: (listing: { label: string }) => ({ baseName: listing.label, icon: null }) },
}));
vi.mock('@/features/dashboard', () => ({
  openFavoriteItemSideEffect: { apply },
  isNativeAddableDashboardId: () => false,
  widgetTopbarActionButtonClass: '',
  widgetTopbarActionVisibilityClass: '',
}));

import { FavoritesFullscreen } from './FavoritesFullscreen';

const renderPage = () =>
  render(
    <IntlProvider locale="en" messages={{}}>
      <FavoritesFullscreen />
    </IntlProvider>,
  );

describe('FavoritesFullscreen', () => {
  beforeEach(() => {
    removeItemFromFolder.mockClear();
    apply.mockClear();
    state.favoriteIds = new Set(['coinflip', 'staking']);
  });

  it('renders a card per favorite product', () => {
    renderPage();
    expect(screen.getByText('coinflip')).toBeInTheDocument();
    expect(screen.getByText('staking')).toBeInTheDocument();
  });

  it('opens a product via the side-effect', () => {
    renderPage();
    screen.getByRole('button', { name: 'coinflip' }).click();
    expect(apply).toHaveBeenCalledWith({ itemId: 'coinflip' });
  });

  it('removes a product from favorites', () => {
    renderPage();
    screen.getAllByTestId('favorites-card-remove')[0]!.click();
    expect(removeItemFromFolder).toHaveBeenCalledWith('coinflip');
  });

  it('filters the grid by the search query', () => {
    renderPage();
    const input = screen.getByTestId('favorites-search-input').querySelector('input');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, { target: { value: 'stak' } });
    expect(screen.queryByText('coinflip')).not.toBeInTheDocument();
    expect(screen.getByText('staking')).toBeInTheDocument();
  });

  it('shows the "no results" state when the search matches no favorite', () => {
    renderPage();
    const input = screen.getByTestId('favorites-search-input').querySelector('input');
    fireEvent.change(input as HTMLInputElement, { target: { value: 'zzz' } });
    expect(screen.getByTestId('favorites-search-no-results')).toBeInTheDocument();
  });

  it('shows the empty state and opens the add dialog via "Browse Apps"', () => {
    state.favoriteIds = new Set();
    renderPage();
    expect(screen.getByTestId('favorites-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('add-to-favorites-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('favorites-browse-apps'));
    expect(screen.getByTestId('add-to-favorites-dialog')).toBeInTheDocument();
  });
});
