/**
 * Renderer-side bridge for the V2 SSO handshake, owned by the onboarding
 * feature (it is the only consumer and it shapes the state the Onboarding UI
 * renders).
 *
 * On mount the hook calls `pappAdapter.sso.authenticate()` and observes the
 * adapter's `pairingStatus`. The SDK owns the V2 pairing service, device-
 * identity persistence, and secrets/session storage; the app's
 * `onPairingSuccess` (see `application/papp-provider`) reacts to publish
 * `userIdentity$`. This hook only translates the host-papp `PairingStatus`
 * into the local `HandshakeState` shape the Onboarding UI consumes.
 *
 * The hook is a no-op outside Electron — the desktop's web build isn't
 * expected to do device-pairing-as-host.
 */

import { type PairingStatus } from '@novasamatech/host-papp';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { isElectron } from '@/shared/env';
import { usePappProvider } from '@/domains/application';
import { type HandshakeState, handshakeService } from '@/domains/sso';

export type UseHandshakeV2Result = {
  qrPayload: string | null;
  state: HandshakeState;
  isLoading: boolean;
};

const pairingStatusToHandshakeState = (status: PairingStatus): HandshakeState => {
  switch (status.step) {
    case 'none':
    case 'initial':
      return handshakeService.idle();
    case 'pairing':
      return handshakeService.submitted();
    case 'pending':
      return { tag: 'Pending', reason: 'AllowanceAllocation' };
    case 'pairingError':
      return { tag: 'Failed', reason: status.message };
    case 'finished':
      // Onboarding flips to the post-handshake route via `userIdentity$`
      // (set inside `onPairingSuccess`), so we only need to signal "done";
      // the SDK owns the persisted session + secrets.
      return handshakeService.submitted();
  }
};

const NONE: PairingStatus = { step: 'none' };

export const useHandshakeV2 = (): UseHandshakeV2Result => {
  const adapter = usePappProvider();
  const [isLoading, setIsLoading] = useState(true);

  const pairingStatus = useSyncExternalStore(
    adapter ? adapter.sso.pairingStatus.subscribe : noopSubscribe,
    adapter ? adapter.sso.pairingStatus.read : readNone,
  );

  useEffect(() => {
    if (!isElectron() || !adapter) {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
    void adapter.sso.authenticate();
    return () => {
      adapter.sso.abortAuthentication();
    };
  }, [adapter]);

  const qrPayload = pairingStatus.step === 'pairing' ? pairingStatus.payload : null;
  const state = useMemo(() => pairingStatusToHandshakeState(pairingStatus), [pairingStatus]);

  return { qrPayload, state, isLoading };
};

const noopSubscribe = () => () => undefined;
const readNone = () => NONE;
