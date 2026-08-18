import { equalBytes } from '@noble/ciphers/utils.js';

import { loadDeviceIdentity } from '../papp-provider/identity';
import { SLOT_PERIOD_SECONDS } from '../statement-store/constants';
import { localAllowanceGateway } from '../statement-store/gateway';
import { lazyClient } from '../statement-store/service';

/**
 * Whether this device's statement account holds a statement-store slot in the
 * current period.
 *
 * `null` means the chain could not answer — storage item absent, identity not
 * loaded, or the read threw. Callers MUST treat that as "cannot tell", never as
 * "lapsed": a renamed storage item would otherwise look like a universal
 * allowance lapse and raise a prompt that can never resolve.
 *
 * Deliberately uncached. This is a decision-grade read taken at the moment an
 * SSO request failed, so a stale answer is worse than a slow one.
 */
async function readLocalAllowance(): Promise<Nullable<boolean>> {
  try {
    const identity = await loadDeviceIdentity();
    if (!identity) return null;

    const period = Math.floor(Date.now() / 1000 / SLOT_PERIOD_SECONDS);
    const slots = await localAllowanceGateway.getStatementStoreSlots(lazyClient.getClient().getUnsafeApi(), period);
    // Absent list = "cannot tell". An EMPTY list is truthy, so a period that
    // genuinely holds no slots still falls through to the `some` below → false.
    if (!slots) return null;

    return slots.some(slot => equalBytes(slot, identity.statementAccountPublicKey));
  } catch (error) {
    // Deliberately swallowed into "cannot tell" — a failed read must degrade to
    // today's behavior, never to a prompt. Logged because a persistently failing
    // read is otherwise indistinguishable from "no lapses ever happened".
    console.warn('[local-allowance] read failed, treating as unverifiable', error);

    return null;
  }
}

export const localAllowanceUseCase = { readLocalAllowance };
