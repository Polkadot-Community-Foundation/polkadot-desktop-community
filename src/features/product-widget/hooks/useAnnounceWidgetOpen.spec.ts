// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { applyMock } = vi.hoisted(() => ({ applyMock: vi.fn() }));

vi.mock('@/domains/product', () => ({
  onProductModalityOpenedSideEffect: { apply: applyMock },
}));

import { useAnnounceWidgetOpen } from './useAnnounceWidgetOpen';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAnnounceWidgetOpen', () => {
  it('fires widget-open on mount for a product', () => {
    renderHook(() => useAnnounceWidgetOpen('app.dot'));
    expect(applyMock).toHaveBeenCalledWith({ productId: 'app.dot', kind: 'widget' });
  });

  it('does not fire when productId is null', () => {
    renderHook(() => useAnnounceWidgetOpen(null));
    expect(applyMock).not.toHaveBeenCalled();
  });
});
