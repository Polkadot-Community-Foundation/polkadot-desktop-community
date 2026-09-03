// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { applyMock, roomsMock } = vi.hoisted(() => ({ applyMock: vi.fn(), roomsMock: vi.fn() }));

vi.mock('@/domains/product', () => ({
  onProductModalityOpenedSideEffect: { apply: applyMock },
}));

vi.mock('@/domains/chat', () => ({
  useUserProductRooms: () => ({ data: roomsMock() }),
}));

import { useAnnounceProductRoomOpen } from './useAnnounceProductRoomOpen';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAnnounceProductRoomOpen', () => {
  it('does not fire on the initial mount for a restored product room', () => {
    roomsMock.mockReturnValue([{ sessionId: 's1', productId: 'app.dot' }]);
    renderHook(() => useAnnounceProductRoomOpen('s1'));
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('fires worker-open when a product room becomes the open session after mount', () => {
    roomsMock.mockReturnValue([{ sessionId: 's1', productId: 'app.dot' }]);
    const { rerender } = renderHook<void, { id: string | null }>(({ id }) => useAnnounceProductRoomOpen(id), {
      initialProps: { id: null },
    });
    expect(applyMock).not.toHaveBeenCalled();

    rerender({ id: 's1' });
    expect(applyMock).toHaveBeenCalledWith({ productId: 'app.dot', kind: 'worker' });
  });

  it('does not fire for a P2P session with no product room', () => {
    roomsMock.mockReturnValue([{ sessionId: 's1', productId: 'app.dot' }]);
    const { rerender } = renderHook<void, { id: string | null }>(({ id }) => useAnnounceProductRoomOpen(id), {
      initialProps: { id: null },
    });
    rerender({ id: 'peer-xyz' });
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('does not fire when nothing is selected', () => {
    roomsMock.mockReturnValue([{ sessionId: 's1', productId: 'app.dot' }]);
    const { rerender } = renderHook<void, { id: string | null }>(({ id }) => useAnnounceProductRoomOpen(id), {
      initialProps: { id: null },
    });
    rerender({ id: null });
    expect(applyMock).not.toHaveBeenCalled();
  });
});
