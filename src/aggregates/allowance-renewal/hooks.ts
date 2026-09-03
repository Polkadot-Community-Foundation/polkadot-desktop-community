import { useRxState } from '@/shared/rxstate';

import { allowanceRenewal } from './state/renewalState';
import { type AllowanceRenewalStatus } from './types';

/** Current renewal status. `idle` unless the user has been asked to open the mobile app. */
export function useAllowanceRenewalStatus(): AllowanceRenewalStatus {
  const [status] = useRxState(allowanceRenewal.status$);

  return status;
}
