import { toastError } from '@novasamatech/tr-ui';

import { type RateLimiterKind, RATE_LIMITED_MESSAGE } from '@/shared/rateLimiter';
import { createAsyncTaskPool } from '@/shared/utils';

type Translate = (id: string, values?: Record<string, string | number>) => string;

function rateLimitToastKey(productId: string, limiterType: RateLimiterKind) {
  return `${productId}:${limiterType}`;
}

export function showRateLimitToast(productId: string, productName: string, limiterType: RateLimiterKind, t: Translate) {
  const key = rateLimitToastKey(productId, limiterType);
  const limiterLabel = t(`widget.rateLimiter.types.${limiterType}`);
  toastError({
    id: `rate-limit:${key}`,
    title: productName,
    description: t('widget.rateLimiter.description', { limiterType: limiterLabel }),
  });
}

export function createOnRateLimited(productId: string, getProductName: () => string, limiterType: RateLimiterKind, t: Translate) {
  return () => {
    const productName = getProductName();
    console.error(RATE_LIMITED_MESSAGE, { productId, productName, limiterType });
    showRateLimitToast(productId, productName, limiterType, t);
  };
}

// Tracks producer subscriptions opened inside a host-container subscribe
// handler. The container's subscription slot only restores its default handler
// on teardown — it never runs the producer unsub the handler returns — and
// `transport.destroy()` doesn't drain active subscriptions. So a producer can
// keep emitting after the container is disposed and call send() on a disposed
// transport, which throws. The transport fans one slot handler out across every
// concurrent subscription (one per requestId), so a scope tracks N unsubs.
//
// Usage inside a useEffect: return `scope.track(producerUnsub)` from the
// subscribe handler, guard the emission callback with `if (scope.disposed)
// return`, and call `scope.dispose()` in the effect cleanup.
export function createSubscriptionScope() {
  const cleanups = new Set<VoidFunction>();
  let disposed = false;

  return {
    get disposed() {
      return disposed;
    },
    track(unsubscribe: VoidFunction): VoidFunction {
      const cleanup = () => {
        cleanups.delete(cleanup);
        unsubscribe();
      };
      cleanups.add(cleanup);
      return cleanup;
    },
    dispose() {
      disposed = true;
      for (const cleanup of [...cleanups]) {
        cleanup();
      }
    },
  };
}

// Sequential papp SSO interactions: one approval modal at a time. Subsequent
// requests queue behind the active one. Callers pass an AbortSignal so an
// unmount during a hung interaction rejects every queued/active task and any
// pending pool.call promise resolves cleanly.
export const pappSsoQueue = createAsyncTaskPool({ poolSize: 1, retryCount: 0, retryDelay: 0 });
