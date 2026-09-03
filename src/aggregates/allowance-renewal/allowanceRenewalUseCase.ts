import { withTimeout } from '@/shared/utils';
import { localAllowanceUseCase } from '@/domains/application';

import { POLL_INTERVAL_MS, RENEWAL_TIMEOUT_MS } from './constants';
import { allowanceRenewal } from './state/renewalState';

// One wait at a time: a lapse breaks every SSO request at once, so a burst of
// failures joins a single poll loop and raises a single prompt.
let inFlight: Nullable<Promise<boolean>> = null;
let stopWait: Nullable<VoidFunction> = null;

function waitForRenewal(): Promise<boolean> {
  allowanceRenewal.status$.set('waiting');

  const poll = new Promise<boolean>(resolve => {
    let timer: Nullable<ReturnType<typeof setTimeout>> = null;
    let settled = false;

    const finish = (renewed: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(renewed);
    };

    stopWait = () => finish(false);

    const scheduleTick = () => {
      timer = setTimeout(() => {
        void localAllowanceUseCase.readLocalAllowance().then(present => {
          if (present === true) finish(true);
          else if (!settled) scheduleTick();
        });
      }, POLL_INTERVAL_MS);
    };

    scheduleTick();
  });

  // `withTimeout` resolves the fallback but cannot stop the loop — settle it here.
  return withTimeout(poll, RENEWAL_TIMEOUT_MS, false).then(renewed => {
    if (!renewed) stopWait?.();

    return renewed;
  });
}

/**
 * Called when an SSO request failed. Resolves `true` ONLY when the local
 * allowance was missing and mobile has since renewed it — i.e. only when
 * retrying the request is worthwhile. Every other outcome resolves `false`, so
 * the caller propagates its original error untouched.
 */
async function ensureLocalAllowance(): Promise<boolean> {
  if (inFlight) return inFlight;

  const present = await localAllowanceUseCase.readLocalAllowance();
  // Present, or unverifiable → this failure was not an allowance lapse.
  if (present !== false) return false;

  // Another caller may have started the wait while we were reading.
  if (inFlight) return inFlight;

  inFlight = waitForRenewal().finally(() => {
    inFlight = null;
    stopWait = null;
    allowanceRenewal.status$.set('idle');
  });

  return inFlight;
}

function cancel(): void {
  stopWait?.();
}

export const allowanceRenewalUseCase = { ensureLocalAllowance, cancel };
