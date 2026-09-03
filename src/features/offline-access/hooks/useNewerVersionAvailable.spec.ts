// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAvailableUpdates, useNewerVersionAvailable } from './useNewerVersionAvailable';

const { usePersistedProductByIdMock, useLiveExecutableMock } = vi.hoisted(() => ({
  usePersistedProductByIdMock: vi.fn(),
  useLiveExecutableMock: vi.fn(),
}));

vi.mock('@/domains/product', () => ({
  EXECUTABLE_KINDS: ['app', 'widget', 'worker'],
  productService: {
    hasExecutableDrift: (frozen: { contenthash: string }, live: { contenthash: string } | null) =>
      live != null && live.contenthash !== frozen.contenthash,
  },
  usePersistedProductById: () => usePersistedProductByIdMock(),
  useLiveExecutable: (params: { kind: string } | null) => useLiveExecutableMock(params),
}));

const hexAa = '0xaa';
const hexBb = '0xbb';

// Returns the mapped live executable for a kind (null for absent/unpinned).
function liveByKind(map: Record<string, { contenthash: string; version: number[] } | null>) {
  return (params: { kind: string } | null) => ({ data: params ? (map[params.kind] ?? null) : null });
}

describe('useAvailableUpdates', () => {
  it('returns [] when the product is not pinned', () => {
    usePersistedProductByIdMock.mockReturnValue({ data: { pinned: false, executables: { worker: { contenthash: hexAa } } } });
    useLiveExecutableMock.mockImplementation(liveByKind({ worker: { contenthash: hexBb, version: [0, 1, 1] } }));
    const { result } = renderHook(() => useAvailableUpdates('a.dot'));
    expect(result.current).toEqual([]);
  });

  it('returns [] when every present kind matches chain', () => {
    usePersistedProductByIdMock.mockReturnValue({
      data: { pinned: true, executables: { app: { contenthash: hexAa }, worker: { contenthash: hexAa } } },
    });
    useLiveExecutableMock.mockImplementation(
      liveByKind({ app: { contenthash: hexAa, version: [2, 1, 0] }, worker: { contenthash: hexAa, version: [0, 1, 0] } }),
    );
    const { result } = renderHook(() => useAvailableUpdates('a.dot'));
    expect(result.current).toEqual([]);
  });

  it('returns the drifted kinds with their frozen and fresh versions', () => {
    usePersistedProductByIdMock.mockReturnValue({
      data: {
        pinned: true,
        executables: {
          app: { contenthash: hexAa, appVersion: [2, 1, 0] },
          widget: { contenthash: hexAa, appVersion: [1, 1, 0] },
        },
      },
    });
    useLiveExecutableMock.mockImplementation(
      liveByKind({ app: { contenthash: hexBb, version: [2, 1, 1] }, widget: { contenthash: hexAa, version: [1, 1, 0] } }),
    );
    const { result } = renderHook(() => useAvailableUpdates('a.dot'));
    expect(result.current).toEqual([{ kind: 'app', fromVersion: [2, 1, 0], toVersion: [2, 1, 1] }]);
  });
});

describe('useNewerVersionAvailable', () => {
  it('is true when at least one kind drifted', () => {
    usePersistedProductByIdMock.mockReturnValue({ data: { pinned: true, executables: { worker: { contenthash: hexAa } } } });
    useLiveExecutableMock.mockImplementation(liveByKind({ worker: { contenthash: hexBb, version: [0, 1, 1] } }));
    const { result } = renderHook(() => useNewerVersionAvailable('a.dot'));
    expect(result.current).toBe(true);
  });

  it('is false when nothing drifted', () => {
    usePersistedProductByIdMock.mockReturnValue({ data: { pinned: true, executables: { worker: { contenthash: hexAa } } } });
    useLiveExecutableMock.mockImplementation(liveByKind({ worker: { contenthash: hexAa, version: [0, 1, 0] } }));
    const { result } = renderHook(() => useNewerVersionAvailable('a.dot'));
    expect(result.current).toBe(false);
  });
});
