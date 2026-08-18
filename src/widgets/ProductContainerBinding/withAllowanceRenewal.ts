import { ResultAsync, errAsync } from 'neverthrow';

import { allowanceRenewalUseCase } from '@/aggregates/allowance-renewal';

/**
 * Retry an SSO request once if — and only if — it failed because this device's
 * local statement-store allowance had lapsed and mobile has since renewed it.
 *
 * Takes a THUNK, not a `ResultAsync`: the request is already in flight by the
 * time a `ResultAsync` exists and cannot be replayed. The thunk runs at most
 * twice.
 *
 * The diagnosis is an on-chain read, not error-shape matching — the failure
 * arriving here may be a NoAllowanceError, an ack failure, or a queue timeout
 * depending on where it was swallowed. Any failure that is not a confirmed
 * lapse propagates its ORIGINAL error, so existing behavior is unchanged.
 */
export function withAllowanceRenewal<T>(request: () => ResultAsync<T, Error>): ResultAsync<T, Error> {
  return request().orElse(error =>
    ResultAsync.fromSafePromise(allowanceRenewalUseCase.ensureLocalAllowance()).andThen(renewed =>
      renewed ? request() : errAsync(error),
    ),
  );
}
