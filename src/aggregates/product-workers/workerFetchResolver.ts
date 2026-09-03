import { useCallback } from 'react';

import { isElectron } from '@/shared/env';
import { useLooseRef } from '@/shared/hooks';
import { type FetchResolver, type PermissionStatus, remoteAccessUseCase, useProductPermissions } from '@/domains/product';

type FetchRequest = Parameters<FetchResolver>[0];
type FetchResponse = Awaited<ReturnType<FetchResolver>>;

// Mirrors the webview's `blockedResponse` — a denied URL gets a 403 rather than a thrown error.
const BLOCKED_RESPONSE: FetchResponse = { status: 403, statusText: 'Forbidden', headers: [], body: new Uint8Array() };

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted', 'AbortError'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function performFetch(req: FetchRequest): Promise<FetchResponse> {
  // In Electron, run through the main process (net.fetch) to bypass renderer CORS, like the
  // webview. On web there is no main process, so fall back to the renderer's own fetch.
  if (isElectron() && window.App?.proxyFetch) {
    return Promise.race([
      window.App.proxyFetch({ url: req.url, method: req.method, headers: req.headers, body: req.body }),
      rejectOnAbort(req.signal),
    ]);
  }

  const response = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    // Re-wrap into an ArrayBuffer-backed view so it satisfies BodyInit.
    body: req.body ? new Uint8Array(req.body) : null,
    signal: req.signal,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers],
    body: new Uint8Array(await response.arrayBuffer()),
    url: response.url,
    redirected: response.redirected,
  };
}

/**
 * Builds the worker's `fetch` resolver, gated against the product's remote permissions through the
 * same chokepoint as the webview and navigateTo. Stable across renders; reads the latest permission
 * state on each call, so grants made after the worker starts take effect immediately.
 */
export function useWorkerFetchResolver(productId: Nullable<string>): FetchResolver {
  // Hold the product's permission subscription open for the worker's lifetime. Worker startup
  // resolves many module imports through this resolver *before* the product view (which otherwise
  // keeps the resource warm) mounts; without this, each fetch's `resolveRemoteUrlAccess` would
  // reopen and tear down a Dexie liveQuery per request instead of replaying the shared cache.
  useProductPermissions(productId);
  const productIdRef = useLooseRef(productId);

  return useCallback<FetchResolver>(async req => {
    const productId = productIdRef();
    if (!productId) return BLOCKED_RESPONSE;

    let status: PermissionStatus;
    try {
      status = await remoteAccessUseCase.resolveRemoteUrlAccess({ productId, url: req.url, modality: 'app' });
    } catch {
      // Fail closed: a permission-layer error (e.g. the permissions stream erroring) denies
      // the fetch with the webview's 403 rather than rejecting and breaking worker loading.
      return BLOCKED_RESPONSE;
    }

    return status === 'granted' ? performFetch(req) : BLOCKED_RESPONSE;
  }, []);
}
