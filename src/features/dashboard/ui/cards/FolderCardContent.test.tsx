// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { foldersUseCase } = vi.hoisted(() => ({
  foldersUseCase: {
    removeItemFromFolder: vi.fn(),
    reorderFolderItems: vi.fn(),
  },
}));

vi.mock('@/domains/application', () => ({
  foldersUseCase,
  dashboardLayoutService: {
    getFavoritesDisplay: (itemCount: number, cap: number) =>
      itemCount <= cap ? { visibleCount: itemCount, hasViewMore: false } : { visibleCount: cap - 1, hasViewMore: true },
  },
}));

vi.mock('@/domains/product', () => ({
  dotNsService: {
    toShortLabel: (value: string) => value,
  },
  usePersistedProducts: () => ({ data: [] }),
}));

vi.mock('../../hooks/useOpenProductSurface', () => ({
  useOpenProductSurface: () => vi.fn(),
}));

vi.mock('../../productIcons', () => ({
  getProductIcon: () => null,
}));

// Stands in for the grid's drag interaction: clicking the button plays back the
// order dnd-kit would have produced, so the test pins the wiring, not the library.
const REORDERED_IDS = ['b', 'c', 'a'];

vi.mock('../folder/FolderGrid', () => ({
  FolderGrid: ({ onReorderItems }: { onReorderItems: (ids: string[]) => void }) => (
    <div data-testid="folder-grid">
      <button type="button" data-testid="reorder" onClick={() => onReorderItems(REORDERED_IDS)}>
        reorder
      </button>
    </div>
  ),
}));

import { TranslationProvider } from '@/shared/translation';

import { FolderCardContent } from './FolderCardContent';

const renderCard = (onBrowseApps?: VoidFunction) =>
  render(
    <TranslationProvider>
      <FolderCardContent cardId="folder-1" items={[]} isActivePage maxVisibleItems={6} onBrowseApps={onBrowseApps} />
    </TranslationProvider>,
  );

const renderPopulatedCard = (isActivePage: boolean) =>
  render(
    <TranslationProvider>
      <FolderCardContent cardId="folder-1" items={['a', 'b', 'c']} isActivePage={isActivePage} maxVisibleItems={6} />
    </TranslationProvider>,
  );

describe('FolderCardContent placeholders', () => {
  it('renders favorites empty placeholder and opens add-widget flow on action click', async () => {
    const user = userEvent.setup();
    const onBrowseApps = vi.fn();
    renderCard(onBrowseApps);

    expect(screen.getByText('Save your favorite apps for quick access')).toBeTruthy();
    await user.click(screen.getByText('Browse Apps'));
    expect(onBrowseApps).toHaveBeenCalledOnce();
  });
});

describe('FolderCardContent reordering', () => {
  beforeEach(() => {
    foldersUseCase.reorderFolderItems.mockClear();
  });

  it('persists a widget reorder as folder item order — the same write the Favorites SPA uses', async () => {
    const user = userEvent.setup();
    renderPopulatedCard(true);

    await user.click(screen.getByTestId('reorder'));

    expect(foldersUseCase.reorderFolderItems).toHaveBeenCalledWith('folder-1', REORDERED_IDS);
  });

  it('ignores a reorder coming from a non-active dashboard page', async () => {
    const user = userEvent.setup();
    renderPopulatedCard(false);

    await user.click(screen.getByTestId('reorder'));

    expect(foldersUseCase.reorderFolderItems).not.toHaveBeenCalled();
  });
});
