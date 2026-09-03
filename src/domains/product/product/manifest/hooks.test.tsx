// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { BehaviorSubject, NEVER } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

const useActiveEnvironmentMock = vi.hoisted(() => vi.fn());
vi.mock('@/domains/application', () => ({ useActiveEnvironment: useActiveEnvironmentMock }));

vi.mock('@/domains/network', () => ({
  ipfsService: { toDataUrl: vi.fn() },
  useIpfsRawData: () => ({ data: null, pending: false, error: null }),
}));

// Resource stubs. `read$` must return a real observable and `cache$` a real
// subject: the transition case below actually starts a read, and `useRead`
// subscribes to both. `NEVER` keeps the read in flight so nothing settles.
vi.mock('./resource', () => ({
  archiveCacheKey: vi.fn(),
  missingArchiveCacheKey: vi.fn(),
  liveExecutableCacheKey: vi.fn(),
  executableArchiveResource: {
    read$: () => NEVER,
    cache$: new BehaviorSubject<Record<string, unknown>>({}),
    key: () => 'archive',
  },
  liveExecutableResource: {
    read$: () => NEVER,
    cache$: new BehaviorSubject<Record<string, unknown>>({}),
    key: () => 'live',
  },
}));

vi.mock('./service', () => ({ manifestService: { isRenderableIconFormat: vi.fn() } }));

import { type Product } from '../types';

import { useExecutableArchive, useLiveExecutable } from './hooks';

const PRODUCT: Product = {
  baseName: 'app.dot',
  displayName: 'App',
  description: '',
  icon: { cid: 'abc', format: 'png' },
  executables: {},
};

describe('useLiveExecutable', () => {
  it('stays pending while the environment is still assembling', () => {
    // `useActiveEnvironment` returns null until Remote Config assembles the environment.
    useActiveEnvironmentMock.mockReturnValue({ data: null, pending: true, error: null });

    const { result } = renderHook(() => useLiveExecutable({ product: PRODUCT, kind: 'app' }));

    // The underlying read is idle in this window and `useRead` reports idle as
    // `pending: false`. Surfacing that verbatim is indistinguishable from
    // "settled — no update available", so the environment's own wait must carry through.
    expect(result.current.pending).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('does not invent pending when no executable was asked for', () => {
    useActiveEnvironmentMock.mockReturnValue({ data: null, pending: true, error: null });

    const { result } = renderHook(() => useLiveExecutable(null));

    // Nothing was requested, so there is nothing to wait for — claiming pending here
    // would stall callers that never wanted a read.
    expect(result.current.pending).toBe(false);
  });

  it('reports settled once the environment has resolved and the read is idle', () => {
    // Partial Environment — the hook only forwards it as a resource param.
    useActiveEnvironmentMock.mockReturnValue({ data: { id: 'alpha' } as never, pending: false, error: null });

    const { result } = renderHook(() => useLiveExecutable(null));

    expect(result.current.pending).toBe(false);
  });
});

describe('useExecutableArchive', () => {
  it('stays pending while the environment is still assembling', () => {
    useActiveEnvironmentMock.mockReturnValue({ data: null, pending: true, error: null });

    const { result } = renderHook(() => useExecutableArchive({ product: PRODUCT, kind: 'app' }));

    // Webview reads `!pending && !content` as "archive missing" and renders an
    // error, so an idle read must not surface as settled here.
    expect(result.current.pending).toBe(true);
  });

  it('does not invent pending when no archive was asked for', () => {
    useActiveEnvironmentMock.mockReturnValue({ data: null, pending: true, error: null });

    const { result } = renderHook(() => useExecutableArchive(null));

    expect(result.current.pending).toBe(false);
  });

  // The read only starts in an effect, so the render where the environment lands
  // is one where nothing has started yet. `result.current` cannot see it (rerender
  // is act-wrapped), hence the per-render capture.
  it('never reports settled across the environment resolving', () => {
    useActiveEnvironmentMock.mockReturnValue({ data: null, pending: true, error: null });

    const seen: boolean[] = [];
    const { rerender } = renderHook(() => {
      const state = useExecutableArchive({ product: PRODUCT, kind: 'app' });
      seen.push(state.pending);

      return state;
    });

    seen.length = 0;
    // Partial Environment — the hook only reads ipfsGatewayUrl off it.
    useActiveEnvironmentMock.mockReturnValue({
      data: { id: 'alpha', ipfsGatewayUrl: 'https://ipfs.example' } as never,
      pending: false,
      error: null,
    });
    rerender();

    expect(seen).not.toContain(false);
  });
});
