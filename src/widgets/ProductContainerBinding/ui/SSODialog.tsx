import { type UserSession } from '@novasamatech/host-papp';
import { NoAllowanceError } from '@novasamatech/statement-store';
import { Button, Dialog, toastError } from '@novasamatech/tr-ui';
import { Clock } from 'lucide-react';
import { type PropsWithChildren, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import SigningPhoneMock from '@/shared/assets/images/signing-phone-mock.svg?jsx';
import { reloadApp } from '@/shared/env';
import { useTranslation } from '@/shared/translation';
import { cnTw } from '@/shared/utils';
import { useSubmitError } from '@/domains/application';
import { productAccountUseCase } from '@/domains/product';
import { allowanceRenewalUseCase, useAllowanceRenewalStatus } from '@/aggregates/allowance-renewal';

import { HavingTroubleSigningDialog } from './HavingTroubleSigningDialog';
import { SigningProductHeader, SubmitErrorAlert, useSigningCountdown } from './signingModalParts';

/**
 * The single dialog shell every SSO interaction renders.
 *
 * Named for SSO rather than signing because it serves every `UserSession`
 * request that needs a review step or waits on mobile — signing AND resource
 * allocation.
 *
 * `Root` owns exactly ONE Radix `Dialog` for the whole flow. A flow's steps
 * (review → waiting on mobile → …) are **content swaps inside it**, never
 * sibling dialogs — mounting a second `Dialog` to change step tears down the
 * overlay, restarts the enter animation and drops focus, which reads as a flash
 * between two different modals.
 *
 * So: no call site renders its own `Dialog`. A step that needs different
 * dismissal semantics registers them with `useDismissOverride` rather than
 * wrapping itself in another dialog.
 *
 * There is no `'use client'` boundary to draw: this app is a Vite/Electron SPA
 * with no React Server Components, so every part below is a client component.
 */

type WaitingVariant = 'signing' | 'allocation';

// The statement-store domain surfaces the raw submit error; the signing UI owns
// mapping it to user-facing copy (known errors get friendly text, others show
// the raw message).
type SubmitErrorInfo = { title: string; description: string };

// Translation keys are static, so the variant table is pure data: a new variant
// is one entry, and the Record makes omitting its copy a compile error.
const WAITING_COPY: Record<WaitingVariant | 'allowanceRenewal', { title: string; line1: string; line2: string }> = {
  signing: {
    title: 'feature.browser.signPolkadotAppTitle',
    line1: 'feature.browser.signPolkadotAppLine1',
    line2: 'feature.browser.signPolkadotAppLine2',
  },
  allocation: {
    title: 'widget.productContainerBinding.allocationRequest.title',
    line1: 'widget.productContainerBinding.allocationRequest.polkadotAppLine1',
    line2: 'widget.productContainerBinding.allocationRequest.polkadotAppLine2',
  },
  allowanceRenewal: {
    title: 'feature.browser.openMobileAppTitle',
    line1: 'feature.browser.openMobileAppLine1',
    line2: 'feature.browser.openMobileAppLine2',
  },
};

type SSODialogContextValue = {
  /** Lets the active step replace what Esc / the X button / an outside click do. */
  setDismissOverride: (handler: VoidFunction | null) => void;
};

const SSODialogContext = createContext<SSODialogContextValue | null>(null);

function useSSODialogContext(component: string): SSODialogContextValue {
  const context = useContext(SSODialogContext);
  if (!context) {
    throw new Error(`SSODialog.${component} must be rendered inside SSODialog.Root`);
  }

  return context;
}

/**
 * Replace the dialog's dismissal behaviour for as long as the calling step is
 * mounted. Restores the `Root`-level handler on unmount. Takes the setter rather
 * than reading context itself so the caller can take context on its FIRST line —
 * a step rendered outside `Root` should report that, not an intl error.
 */
function useDismissOverride(setDismissOverride: SSODialogContextValue['setDismissOverride'], handler: VoidFunction) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    // Double arrow, deliberately: `setDismissOverride` is a state setter, so a
    // bare `() => handlerRef.current()` would be treated as a functional updater
    // and INVOKED on mount — aborting the request the moment this step appears.
    // The outer arrow returns the handler; it does not call it.
    setDismissOverride(() => () => handlerRef.current());

    return () => setDismissOverride(null);
  }, [setDismissOverride]);
}

type RootProps = PropsWithChildren<{
  /**
   * Esc / X / outside click, unless the active step overrides it. Optional: a flow whose only
   * step registers an override (`useDismissOverride`) has no default dismissal to give.
   */
  onDismiss?: VoidFunction;
}>;

// Always open: a flow renders `Root` only while it wants the dialog up, and
// closes it by unmounting. There is no `open={false}` state to model.
const Root = ({ onDismiss, children }: RootProps) => {
  const [dismissOverride, setDismissOverride] = useState<VoidFunction | null>(null);

  const context = useMemo<SSODialogContextValue>(() => ({ setDismissOverride }), []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      (dismissOverride ?? onDismiss)?.();
    }
  };

  const handleInteractOutside = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  return (
    <Dialog modal open onOpenChange={handleOpenChange}>
      <Dialog.Content
        aria-describedby={undefined}
        showCloseButton
        variant="tall"
        onOpenAutoFocus={event => event.preventDefault()}
        onInteractOutside={handleInteractOutside}
      >
        <SSODialogContext.Provider value={context}>{children}</SSODialogContext.Provider>
      </Dialog.Content>
    </Dialog>
  );
};

// The dialog heading style lives here rather than in `signingModalParts` because
// `Title` is now its only consumer — every step renders the heading through it.
const headingClassName = cnTw('text-2xl leading-8 font-semibold text-fg-primary');

/** The dialog's accessible name. Every step must render exactly one. */
const Title = ({ children }: PropsWithChildren) => (
  <Dialog.Title asChild>
    <h2 className={headingClassName}>{children}</h2>
  </Dialog.Title>
);

/**
 * A request is in flight on the paired device by the time a waiting step is on
 * screen. Leaving without a response must drop it, or the statement store keeps
 * it and re-triggers the device the next time the app opens. Best-effort: the
 * caller is released regardless, so a throwing SDK call cannot strand it.
 */
function abortPendingRequests(session: UserSession) {
  try {
    void session.abortPendingRequests().mapErr(error => {
      console.warn('[SSODialog] abortPendingRequests failed', error);

      return error;
    });
  } catch (error) {
    console.warn('[SSODialog] abortPendingRequests threw', error);
  }
}

/** The paragraph block under a step's title. */
const BodyCopy = ({ lines }: { lines: string[] }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-0 text-base leading-6 font-normal text-fg-primary">
      {lines.map(line => (
        <p key={line} className="leading-6">
          {t(line)}
        </p>
      ))}
    </div>
  );
};

/** The phone illustration every waiting step shows, with an optional countdown badge. */
const PhoneMock = ({ countdown = null }: { countdown?: string | null }) => {
  const { t } = useTranslation();

  return (
    <div className="pointer-events-none mx-auto w-58.5 pt-6 pb-5 **:pointer-events-none">
      <div className="relative" aria-hidden>
        <SigningPhoneMock className="h-77.25 w-full" />
        {countdown === null ? null : (
          <div
            className="absolute top-4 left-1/2 z-10 inline-flex h-6 min-h-6 w-fit max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-stroke-primary bg-bg-surface-container px-2 py-0 text-xs leading-4 font-medium text-fg-primary"
            aria-live="polite"
          >
            <Clock className="size-3.5 shrink-0 text-fg-primary" aria-hidden />
            <span className="whitespace-nowrap">{t('feature.browser.signPolkadotAppValidFor', { time: countdown })}</span>
          </div>
        )}
        <p className="absolute top-43 left-1/2 z-10 -translate-x-1/2 text-center text-xs leading-4 font-medium whitespace-nowrap text-fg-primary">
          {t('feature.browser.signPolkadotAppDeviceLabel')}
        </p>
      </div>
    </div>
  );
};

/** The single-action footer both waiting steps end with. */
const CancelFooter = ({ onCancel }: { onCancel: VoidFunction }) => {
  const { t } = useTranslation();

  return (
    <div className="shrink-0 pt-4">
      <Dialog.Footer>
        <Button type="button" variant="outline" fullWidth onClick={onCancel}>
          {t('common.action.cancel')}
        </Button>
      </Dialog.Footer>
    </div>
  );
};

type RequestingProductSubtreeProps = {
  session: UserSession;
  productIdentifier: string;
  /**
   * Whether the device request should actually fire. A flow mounts this step while it is
   * still reading persistence and arms it only once it knows the key is missing — the step
   * stays on screen for the whole wait, instead of the next step flashing in between.
   */
  armed?: boolean;
  onResult: (subtreeKey: Uint8Array) => void;
  onReject: (reason: unknown) => void;
};

/**
 * The subtree key request (RFC-0022), made visible.
 *
 * Unlike every review step there is no approve button: the request is already in flight when
 * this appears. The user is being told their device is being asked for something and given a
 * way out — not asked for permission. Rejecting persists nothing, so the next attempt re-asks.
 */
const RequestingProductSubtree = ({
  session,
  productIdentifier,
  armed = true,
  onResult,
  onReject,
}: RequestingProductSubtreeProps) => {
  // Context first: a step rendered outside `Root` must report that, not an intl error.
  const { setDismissOverride } = useSSODialogContext('RequestingProductSubtree');
  const { t } = useTranslation();
  // StrictMode double-invokes mount effects; the request must reach the device once.
  const requestStartedRef = useRef(false);
  const settledRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!armed || requestStartedRef.current) return;
    requestStartedRef.current = true;

    productAccountUseCase.requestProductSubtree(session, productIdentifier).then(
      subtreeKey => {
        if (settledRef.current) return;
        settledRef.current = true;
        onResult(subtreeKey);
      },
      error => {
        if (settledRef.current) return;
        console.error('[product-subtree] request failed', error);
        setFailed(true);
      },
    );
  }, [armed, onResult, productIdentifier, session]);

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    abortPendingRequests(session);
    toastError({ title: t('widget.productContainerBinding.subtreeRequest.rejected') });
    onReject(new Error('Product subtree request rejected'));
  };

  // While this step is up, Esc / X / outside click must abort the in-flight request —
  // not run the host flow's plain review rejection.
  useDismissOverride(setDismissOverride, cancel);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {/* Whose accounts the device is being asked for — the same header every
            sibling SSO step shows, so the one step that named no product no
            longer asks the user to take that on trust. */}
        <div className="pb-2">
          <SigningProductHeader identifier={productIdentifier} />
        </div>

        <Title>{t('widget.productContainerBinding.subtreeRequest.title')}</Title>

        {failed ? (
          <SubmitErrorAlert
            title={t('widget.productContainerBinding.subtreeRequest.failedTitle')}
            description={t('widget.productContainerBinding.subtreeRequest.failedDescription')}
          />
        ) : armed ? (
          <BodyCopy
            lines={['widget.productContainerBinding.subtreeRequest.line1', 'widget.productContainerBinding.subtreeRequest.line2']}
          />
        ) : (
          <BodyCopy lines={['widget.productContainerBinding.subtreeRequest.preparing']} />
        )}

        <PhoneMock />
      </div>

      <CancelFooter onCancel={cancel} />
    </div>
  );
};

type WaitingForMobileProps = {
  variant?: WaitingVariant;
  lifetimeMs: number | null;
  session: UserSession;
  /**
   * The request could not complete — the user cancelled, or the signing window
   * expired. One callback rather than two because no call site distinguishes
   * them; the differing user-facing toast is chosen internally.
   */
  onAbort: VoidFunction;
};

/**
 * The "waiting on the Polkadot mobile app" step, complete with its own title,
 * countdown, submit-error surface and cancel footer.
 *
 * It is one component rather than a bag of composable parts because all seven
 * flows render exactly this, and because its pieces are interdependent: the
 * countdown drives the timeout, the timeout drives dismissal, and the
 * local-allowance renewal suspends both.
 */
const WaitingForMobile = ({ variant = 'signing', lifetimeMs, session, onAbort }: WaitingForMobileProps) => {
  // Context first: a step rendered outside `Root` must report that, not an intl error.
  const { setDismissOverride } = useSSODialogContext('WaitingForMobile');
  const { t } = useTranslation();
  const rejectionToastShownRef = useRef(false);
  const suppressRejectionToastRef = useRef(false);
  const [havingTroubleOpen, setHavingTroubleOpen] = useState(false);
  const isAllocation = variant === 'allocation';
  // The local statement-store allowance lapsed and mobile must re-allocate it.
  // This step is already on screen for every wrapped SSO request, so the prompt
  // replaces its copy rather than opening a second dialog.
  const isRenewingAllowance = useAllowanceRenewalStatus() === 'waiting';
  const rawSubmitError = useSubmitError(!isAllocation);
  const submitError = useMemo<SubmitErrorInfo | null>(() => {
    if (!rawSubmitError) return null;
    if (rawSubmitError instanceof NoAllowanceError) {
      return {
        title: t('feature.browser.noAllowanceErrorTitle'),
        description: t('feature.browser.noAllowanceErrorDescription'),
      };
    }

    return { title: t('feature.browser.statementStoreErrorTitle'), description: rawSubmitError.message };
  }, [rawSubmitError, t]);

  const dismiss = () => {
    if (rejectionToastShownRef.current || suppressRejectionToastRef.current) {
      return;
    }
    rejectionToastShownRef.current = true;
    // Settle any renewal wait as "not renewed" so the caller's original error
    // propagates instead of the request hanging until the renewal times out.
    allowanceRenewalUseCase.cancel();
    abortPendingRequests(session);
    toastError({
      title: isAllocation
        ? t('widget.productContainerBinding.allocationRequest.allocationRejected')
        : t('feature.browser.transactionSigningRejected'),
    });
    onAbort();
  };

  // While this step is up, Esc / X / outside click must abort the in-flight
  // request — not run the review step's plain rejection.
  useDismissOverride(setDismissOverride, dismiss);

  const handleExpire = () => {
    abortPendingRequests(session);
    toastError({
      title: t('feature.browser.signingTimedOutTitle'),
      description: t('feature.browser.signingTimedOutBody'),
      duration: 10_000,
    });
    onAbort();
  };

  // Suspend the countdown while renewing: its expiry aborts the pending request
  // and closes the flow, which would kill the very request the renewal is
  // rescuing. `useSigningCountdown` retains its last value when suspended, so the
  // renewal gate is applied here and published as a single nullable value.
  const rawCountdown = useSigningCountdown(isRenewingAllowance ? null : lifetimeMs, handleExpire);
  const countdown = isRenewingAllowance ? null : rawCountdown;

  // Renewal is an interrupt, not a flavour of the caller's request: the local
  // allowance gates every SSO request, so while it renews this overrides
  // whatever the call site asked for.
  const copy = WAITING_COPY[isRenewingAllowance ? 'allowanceRenewal' : variant];

  const handleHavingTroubleClick = () => {
    setHavingTroubleOpen(true);
  };

  const handleHavingTroubleCancel = () => {
    setHavingTroubleOpen(false);
  };

  const handleHavingTroubleReload = () => {
    setHavingTroubleOpen(false);
    suppressRejectionToastRef.current = true;
    abortPendingRequests(session);
    reloadApp();
  };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <Title>{t(copy.title)}</Title>
        <BodyCopy lines={[copy.line1, copy.line2]} />
        {/* Suppressed while renewing: the renewal copy already says what to do, and
            the underlying NoAllowance error is exactly what the renewal resolves. */}
        {submitError && !isRenewingAllowance ? (
          <SubmitErrorAlert title={submitError.title} description={submitError.description} />
        ) : null}
        <PhoneMock countdown={countdown} />
        <div className="flex min-h-9 justify-center px-4 py-1">
          <button
            type="button"
            className="rounded-lg px-4 py-1 text-sm leading-5 font-semibold text-fg-link"
            onClick={handleHavingTroubleClick}
          >
            {t('feature.browser.havingTroubleSigning')}
          </button>
        </div>
      </div>
      <CancelFooter onCancel={dismiss} />
      <HavingTroubleSigningDialog
        open={havingTroubleOpen}
        onCancel={handleHavingTroubleCancel}
        onReload={handleHavingTroubleReload}
      />
    </div>
  );
};

export const SSODialog = {
  Root,
  Title,
  RequestingProductSubtree,
  WaitingForMobile,
};
