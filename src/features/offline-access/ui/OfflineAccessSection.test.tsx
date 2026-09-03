// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OfflineAccessSection } from './OfflineAccessSection';

const { useDisplayedProductMock, useIsPinnedMock, useAvailableUpdatesMock, openDialogMock } = vi.hoisted(() => ({
  useDisplayedProductMock: vi.fn(),
  useIsPinnedMock: vi.fn(),
  useAvailableUpdatesMock: vi.fn(),
  openDialogMock: vi.fn(),
}));

vi.mock('@/domains/product', () => ({
  useDisplayedProduct: () => useDisplayedProductMock(),
  useIsPinned: () => useIsPinnedMock(),
  manifestService: { formatVersion: (v: number[]) => v.join('.') },
}));

vi.mock('../hooks/useNewerVersionAvailable', () => ({
  useAvailableUpdates: () => useAvailableUpdatesMock(),
}));

vi.mock('../state/dialogState', () => ({
  openOfflineAccessDialog: (arg: unknown) => openDialogMock(arg),
}));

vi.mock('@/shared/translation', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));

const setup = (updates: { kind: string; fromVersion: number[]; toVersion: number[] }[]) => {
  useDisplayedProductMock.mockReturnValue({ data: { displayName: 'Hack3m', baseName: 'a.dot' } });
  useIsPinnedMock.mockReturnValue(true);
  useAvailableUpdatesMock.mockReturnValue(updates);
  return render(<OfflineAccessSection productId="a.dot" />);
};

describe('OfflineAccessSection update rows', () => {
  it('renders one row per drifted modality with the from→to version line', () => {
    setup([
      { kind: 'app', fromVersion: [2, 1, 0], toVersion: [2, 1, 1] },
      { kind: 'widget', fromVersion: [1, 1, 0], toVersion: [1, 1, 1] },
    ]);
    expect(screen.getAllByTestId('offline-access-update-button')).toHaveLength(2);
    expect(
      screen.getByText('feature.offlineAccess.section.updateReady:{"fromVersion":"2.1.0","toVersion":"2.1.1"}'),
    ).toBeTruthy();
  });

  it('omits the version line when a version is all-zero (legacy)', () => {
    setup([{ kind: 'worker', fromVersion: [0, 0, 0], toVersion: [0, 0, 0] }]);
    expect(screen.queryByText(/updateReady/)).toBeNull();
  });

  it('opens the per-modality confirmation dialog on Update click (no inline re-pin)', () => {
    setup([{ kind: 'app', fromVersion: [2, 1, 0], toVersion: [2, 1, 1] }]);
    fireEvent.click(screen.getByTestId('offline-access-update-button'));
    expect(openDialogMock).toHaveBeenCalledWith({ kind: 'updateExecutable', productId: 'a.dot', executableKind: 'app' });
  });
});
