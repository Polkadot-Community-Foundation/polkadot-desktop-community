// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { applyMock, selectedTabMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  selectedTabMock: vi.fn(),
}));

vi.mock('@/domains/product', () => ({
  onProductModalityOpenedSideEffect: { apply: applyMock },
}));

vi.mock('@/aggregates/browser-tabs', () => ({
  browserTabs: { selectedTab$: 'selectedTab$' },
}));

vi.mock('react-rx', () => ({
  useObservable: () => selectedTabMock(),
}));

import { useAnnounceAppOpen } from './useAnnounceAppOpen';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAnnounceAppOpen', () => {
  it('does not fire on the initial mount for a restored product tab', () => {
    selectedTabMock.mockReturnValue({ id: 'app.dot', type: 'product' });
    renderHook(() => useAnnounceAppOpen());
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('fires app-open when a product tab becomes selected after mount', () => {
    selectedTabMock.mockReturnValue(null);
    const { rerender } = renderHook(() => useAnnounceAppOpen());
    expect(applyMock).not.toHaveBeenCalled();

    selectedTabMock.mockReturnValue({ id: 'app.dot', type: 'product' });
    rerender();
    expect(applyMock).toHaveBeenCalledWith({ productId: 'app.dot', kind: 'app' });
  });

  it('does not fire when a system tab becomes selected', () => {
    selectedTabMock.mockReturnValue(null);
    const { rerender } = renderHook(() => useAnnounceAppOpen());

    selectedTabMock.mockReturnValue({ id: 'dashboard', type: 'dashboard' });
    rerender();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('does not fire when a new-tab becomes selected', () => {
    selectedTabMock.mockReturnValue(null);
    const { rerender } = renderHook(() => useAnnounceAppOpen());

    selectedTabMock.mockReturnValue({ id: 'new-tab-id', type: 'new-tab' });
    rerender();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('does not fire when nothing is selected', () => {
    selectedTabMock.mockReturnValue(null);
    const { rerender } = renderHook(() => useAnnounceAppOpen());
    rerender();
    expect(applyMock).not.toHaveBeenCalled();
  });
});
