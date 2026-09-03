import { type UserSession } from '@novasamatech/host-papp';
import { useCallback, useEffect, useState } from 'react';

import { useConfirmation } from '@/shared/components';
import { productAccountUseCase } from '@/domains/product';
import { SSODialog } from '../ui/SSODialog';

/**
 * Resolving a product's subtree key without ever reaching the paired device invisibly.
 *
 * The key is persisted, so both entry points here are a no-op after the first success for a
 * pairing — a hit resolves with no UI at all. They differ in who owns the dialog:
 *
 * - {@link useProductSubtreeGate} — for the SSO modals, which are step machines. It hands back a
 *   step the host renders inside its own `SSODialog.Root`, so nothing stacks.
 * - {@link useEnsureProductSubtree} — for container handlers with no host flow, which have
 *   nowhere to put a step and so open a dialog of their own through `useConfirmation`.
 */

// One in-flight request per (session, product), for the `useConfirmation` path only — today
// that is concurrent `handleAccountGet` calls from a product asking for several accounts at
// once. A second caller MUST await the first promise rather than call confirm() again:
// `ConfirmationProvider` rejects the entry already on screen when an id is reused, so sharing
// an id would kill the first caller instead of sharing with it. The entry is deleted on settle,
// so a rejection re-asks next time.
const inflight = new Map<string, Promise<Uint8Array>>();

const gateKey = (session: UserSession, productId: string): string => `${session.id}:${productId}`;

/**
 * Returns a callback that resolves the product's subtree key, prompting only when it is not
 * already stored. Use this from a container handler, which has no wizard to add a step to;
 * modals that own a `step` machine should use {@link useProductSubtreeGate} instead.
 */
export const useEnsureProductSubtree = () => {
  const confirm = useConfirmation();

  return useCallback(
    (session: UserSession, productId: string): Promise<Uint8Array> => {
      const key = gateKey(session, productId);
      const existing = inflight.get(key);
      if (existing) return existing;

      const run = async (): Promise<Uint8Array> => {
        const persisted = await productAccountUseCase.readPersistedProductSubtree(session, productId);
        if (persisted) return persisted;

        // No host flow here, so this path opens the dialog shell the SSO modals already have up.
        // It is the only step, and it owns dismissal, so `Root` needs no default.
        return confirm<Uint8Array>(key, ({ resolve, reject }) => (
          <SSODialog.Root>
            <SSODialog.RequestingProductSubtree
              session={session}
              productIdentifier={productId}
              onResult={resolve}
              onReject={reject}
            />
          </SSODialog.Root>
        ));
      };

      // Store the chained promise, not the one it derives from: `.finally` returns a NEW
      // promise, and leaving it unhandled on the rejection path fails the whole vitest run.
      const shared = run().finally(() => inflight.delete(key));
      inflight.set(key, shared);

      return shared;
    },
    [confirm],
  );
};

type GateOptions = {
  /** Rejects the host flow when the user dismisses the step. */
  onReject: (reason: unknown) => void;
  /**
   * `false` means there is nothing to gate — `ready` is true immediately and no step is shown.
   * Pass it when the caller's derivation-index batch is empty.
   */
  enabled?: boolean;
};

/**
 * Step binding for the SSO modals.
 *
 * These modals are already step machines — one `SSODialog.Root` whose content swaps as the flow
 * advances (`review` -> `polkadotApp`). The subtree request is one more step in that sequence, so
 * this hook hands back the step to render (or `null` once the key is resolved) and the host drops
 * it into its own `Root`. Nothing stacks, which is why there is no `confirm()` here — that path is
 * for container handlers with no host flow (see {@link useEnsureProductSubtree}).
 *
 * The hook owns the whole hold/arm rule so no host restates it: the step is held while the
 * persistence read is in flight AND while the key is missing, so the next step never flashes in
 * between, and it is armed — the device request actually fires — only once the key is known absent.
 *
 * Consumers MUST hold their address read idle (pass a `null` session) until `ready`: `useRead`
 * fires once per key and latches a rejection, so a read issued before the key is stored would fail
 * permanently and never retry once the step completes.
 *
 * `session` is deliberately NOT nullable, unlike the address hooks it gates. Those accept `null`
 * to stay idle; this one has no idle state to fall back to — with no session there is nothing to
 * read persistence with and nothing to request from, so the step would stay unarmed forever. Use
 * `enabled` to defer, not a null session.
 */
export const useProductSubtreeGate = (session: UserSession, productId: string, { onReject, enabled = true }: GateOptions) => {
  // `undefined` = not read yet, `null` = confirmed absent.
  const [persisted, setPersisted] = useState<Nullable<Uint8Array> | undefined>(undefined);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    productAccountUseCase.readPersistedProductSubtree(session, productId).then(
      key => {
        if (!cancelled) setPersisted(key);
      },
      () => {
        // A failed persistence read is indistinguishable from a miss for our purposes: run the step.
        if (!cancelled) setPersisted(null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [enabled, session, productId]);

  const ready = !enabled || completed || Boolean(persisted);

  return {
    ready,
    requestStep: ready ? null : (
      <SSODialog.RequestingProductSubtree
        session={session}
        productIdentifier={productId}
        armed={persisted === null}
        onResult={() => setCompleted(true)}
        onReject={onReject}
      />
    ),
  };
};
