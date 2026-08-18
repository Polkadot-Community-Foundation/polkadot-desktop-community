// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ListingsState = { data: { label: string }[]; pending: boolean; error: unknown; refresh: () => void };

const { addToFavorites, removeItemFromFolder, refresh, listings, state } = vi.hoisted(() => ({
  addToFavorites: vi.fn(),
  removeItemFromFolder: vi.fn(),
  refresh: vi.fn(),
  listings: { data: [], pending: false, error: null } as unknown as ListingsState,
  // Read per render, so a test can flip membership while the dialog stays open.
  state: { favoriteIds: new Set<string>() },
}));

vi.mock('@/domains/application', () => ({
  useFavoriteProductIds: () => ({ data: state.favoriteIds }),
  useAddToFavorites: () => ({ addToFavorites }),
  useRemoveItemFromFolder: () => ({ removeItemFromFolder }),
}));
vi.mock('@/domains/product', () => ({
  usePublishedAppListings: () => ({ ...listings, refresh }),
  useProductIcon: () => ({ data: null }),
  dotNsService: { toShortLabel: (id: string) => id },
  useDotNsTld: () => ({ data: '.dot', pending: false, error: null, refresh: vi.fn() }),
  useDotNsLabels: () => ({
    displayName: (name: string) => name.replace(/\.dot$/, ''),
    shortLabel: (name: string) => name.replace(/\.dot$/, ''),
  }),
  browseService: {
    listingBaseName: (listing: { label: string }) => listing.label.replace('.dot', ''),
    productPreviewFromListing: (_listing: { label: string }, baseName: string) => ({ baseName, icon: null }),
  },
}));

import { AddToFavoritesDialog } from './AddToFavoritesDialog';

const renderDialog = () =>
  render(
    <IntlProvider locale="en" messages={{}}>
      <AddToFavoritesDialog isOpen onClose={vi.fn()} />
    </IntlProvider>,
  );

const setListings = (next: Partial<ListingsState>) => Object.assign(listings, next);

describe('AddToFavoritesDialog', () => {
  beforeEach(() => {
    addToFavorites.mockClear();
    removeItemFromFolder.mockClear();
    refresh.mockClear();
    state.favoriteIds = new Set(['staking']);
    setListings({ data: [{ label: 'coinflip.dot' }, { label: 'staking.dot' }], pending: false, error: null });
  });

  it('excludes already-favorite products from the list at open', () => {
    renderDialog();
    // staking is already a favorite -> filtered out; coinflip (non-favorite) stays.
    expect(screen.getByText('coinflip')).toBeInTheDocument();
    expect(screen.queryByText('staking')).not.toBeInTheDocument();
  });

  it('adds a candidate product to favorites (and it stays in the list)', () => {
    renderDialog();
    const toggles = screen.getAllByTestId('add-to-favorites-toggle');
    expect(toggles).toHaveLength(1);
    toggles[0]!.click();
    expect(addToFavorites).toHaveBeenCalledWith('coinflip');
    // Still present after adding — the list is snapshotted at open.
    expect(screen.getByText('coinflip')).toBeInTheDocument();
  });

  it('shows the action the toggle performs, not the current membership state', () => {
    // Nothing favorite at open, so both products are listed and stay listed.
    state.favoriteIds = new Set();
    const { rerender } = renderDialog();

    const glyphOf = (index: number) =>
      screen.getAllByTestId('add-to-favorites-toggle')[index]!.querySelector('svg')?.getAttribute('class') ?? '';

    // Not a favorite -> the button adds -> plain star.
    expect(glyphOf(0)).toContain('star');
    expect(glyphOf(0)).not.toContain('star-off');

    // Becomes a favorite while the dialog is open -> the button now removes -> crossed star.
    state.favoriteIds = new Set(['coinflip']);
    rerender(
      <IntlProvider locale="en" messages={{}}>
        <AddToFavoritesDialog isOpen onClose={vi.fn()} />
      </IntlProvider>,
    );

    expect(glyphOf(0)).toContain('star-off');
  });

  it('shows the loading spinner while the catalog is pending', () => {
    setListings({ data: [], pending: true });
    renderDialog();
    expect(screen.getByTestId('add-to-favorites-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('add-to-favorites-toggle')).not.toBeInTheDocument();
  });

  it('shows an error state with a Retry that refreshes the catalog', () => {
    setListings({ data: [], pending: false, error: new Error('boom') });
    renderDialog();
    expect(screen.getByTestId('add-to-favorites-error')).toBeInTheDocument();
    screen.getByTestId('add-to-favorites-retry').click();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the "nothing to add" state when nothing is left to add', () => {
    setListings({ data: [] });
    renderDialog();
    expect(screen.getByTestId('add-to-favorites-nothing-to-add')).toBeInTheDocument();
  });

  it('shows the "no results" state when the search matches nothing', () => {
    renderDialog();
    const input = screen.getByTestId('add-to-favorites-search-input').querySelector('input');
    fireEvent.change(input as HTMLInputElement, { target: { value: 'zzz' } });
    expect(screen.getByTestId('add-to-favorites-no-results')).toBeInTheDocument();
    expect(screen.queryByTestId('add-to-favorites-nothing-to-add')).not.toBeInTheDocument();
  });
});
