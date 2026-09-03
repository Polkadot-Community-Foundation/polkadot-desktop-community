import { type AllocatableResource, type AllocationOutcome, type CodecType } from '@novasamatech/host-api';
import { type UserSession } from '@novasamatech/host-papp';
import { Button } from '@novasamatech/tr-ui';
import { ChevronLeft } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import { TEST_IDS } from '@/shared/test-ids';
import { useTranslation } from '@/shared/translation';
import { productAccountService, useDisplayedProduct, useDotNsTld, useProductAccountAddresses } from '@/domains/product';
import { useProductSubtreeGate } from '../integrations/productSubtree';
import { withAllowanceRenewal } from '../withAllowanceRenewal';
import { SIGNING_TIMEOUT_MS, withSigningTimeout } from '../withSigningTimeout';

import { SSODialog } from './SSODialog';
import {
  SigningAccountDetailsSection,
  SigningProductHeader,
  SigningReviewFooter,
  getProductPresentation,
  signingDialogCornerControlClassName,
  signingRawMessageCardClassName,
} from './signingModalParts';

type AllocatableResourceValue = CodecType<typeof AllocatableResource>;
type AllocationOutcomeValue = CodecType<typeof AllocationOutcome>;
type SmartContractResource = Extract<AllocatableResourceValue, { tag: 'SmartContractAllowance' }>;
// host-papp 0.7.9 still speaks the v0.7 wire shape for resource allocation.
type PappAllocatableResource = Parameters<UserSession['requestResourceAllocation']>[0]['resources'][number];

type Props = {
  productIdentifier: string;
  resources: AllocatableResourceValue[];
  session: UserSession;
  onResult: (outcomes: AllocationOutcomeValue[]) => void;
  onReject: VoidFunction;
};

const isSmartContractResource = (resource: AllocatableResourceValue): resource is SmartContractResource =>
  resource.tag === 'SmartContractAllowance';

export const AllocationRequestModal = memo(({ productIdentifier, resources, session, onResult, onReject }: Props) => {
  const { t } = useTranslation();
  const grantStartedRef = useRef(false);
  const [step, setStep] = useState<'review' | 'polkadotApp'>('review');
  const [error, setError] = useState<string | null>(null);
  const [showSmartContractDetails, setShowSmartContractDetails] = useState(false);

  const { data: product } = useDisplayedProduct(productIdentifier);
  const { data: tld } = useDotNsTld();
  const productName = product?.displayName ?? getProductPresentation(productIdentifier, tld).name;

  const smartContractResources = useMemo(() => resources.filter(isSmartContractResource), [resources]);
  const otherResources = useMemo(() => resources.filter(resource => !isSmartContractResource(resource)), [resources]);

  // RFC-0022: addresses are fetched from the paired device, not derived locally.
  // `enabled` is false for an allocation with no smart-contract resources: it needs no
  // subtree key, so the user must not be prompted for one.
  const { ready: subtreeReady, requestStep: subtreeStep } = useProductSubtreeGate(session, productIdentifier, {
    onReject,
    enabled: smartContractResources.length > 0,
  });
  const { data: smartContractAddresses, error: smartContractAddressesError } = useProductAccountAddresses(
    subtreeReady ? session : null,
    productIdentifier,
    smartContractResources.map(resource => resource.value),
  );

  const hasSmartContractDetails = smartContractResources.length > 0;
  // The addresses name the accounts this grant applies to, so the user cannot consent to the
  // grant before they resolve. Mirrors the signing modals, which gate on the same value.
  const isAwaitingAddresses = hasSmartContractDetails && !smartContractAddresses && !smartContractAddressesError;
  const hasAddressFailure = hasSmartContractDetails && Boolean(smartContractAddressesError);

  const renderOtherResourceLabel = (resource: AllocatableResourceValue) => {
    switch (resource.tag) {
      case 'StatementStoreAllowance':
        return t('widget.productContainerBinding.allocationRequest.resource.StatementStoreAllowance');
      case 'BulletinAllowance':
        return t('widget.productContainerBinding.allocationRequest.resource.BulletinAllowance');
      case 'AutoSigning':
        return t('widget.productContainerBinding.allocationRequest.resource.AutoSigning');
      case 'SmartContractAllowance':
        return t('widget.productContainerBinding.allocationRequest.resource.SmartContractAllowance');
    }
  };

  const requestAllocation = useCallback(() => {
    // host-api 0.8 renamed the resource tag BulletInAllowance → BulletinAllowance, but host-papp
    // (still 0.7.9) decodes against the old tag. Remap at the cross-version boundary.
    const pappResources: PappAllocatableResource[] = resources.map(resource =>
      resource.tag === 'BulletinAllowance' ? { tag: 'BulletInAllowance', value: undefined } : resource,
    );

    withAllowanceRenewal(() =>
      withSigningTimeout(
        session.requestResourceAllocation({
          callingProductId: productIdentifier,
          resources: pappResources,
          onExisting: 'Increase',
        }),
      ),
    ).match(
      outcomes => {
        const mapped: AllocationOutcomeValue[] = outcomes.map(outcome =>
          outcome.tag === 'Allocated' ? { tag: 'Allocated', value: undefined } : outcome,
        );
        onResult(mapped);
      },
      e => {
        grantStartedRef.current = false;
        setStep('review');
        setError(e.message);
      },
    );
  }, [onResult, productIdentifier, resources, session]);

  const handleApprove = () => {
    if (grantStartedRef.current) {
      return;
    }
    grantStartedRef.current = true;
    setError(null);
    setStep('polkadotApp');
    requestAllocation();
  };

  // Only reached during the review step — `WaitingForMobile` overrides dismissal
  // while it is mounted, so no step check is needed here.
  const handleDismiss = useCallback(() => {
    if (!grantStartedRef.current) {
      onReject();
    }
  }, [onReject]);

  const handleShowSmartContractDetails = () => {
    setShowSmartContractDetails(true);
  };

  const handleHideSmartContractDetails = () => {
    setShowSmartContractDetails(false);
  };

  return (
    <SSODialog.Root onDismiss={handleDismiss}>
      {subtreeStep ??
        (step === 'polkadotApp' ? (
          <SSODialog.WaitingForMobile variant="allocation" lifetimeMs={SIGNING_TIMEOUT_MS} session={session} onAbort={onReject} />
        ) : (
          <>
            <div className="contents" data-testid={TEST_IDS.allocationRequestDialog} />
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6">
              {!showSmartContractDetails ? <SigningProductHeader identifier={productIdentifier} /> : null}

              {!showSmartContractDetails ? (
                <div className="pt-2">
                  <SSODialog.Title>{t('widget.productContainerBinding.allocationRequest.title')}</SSODialog.Title>
                  <p className="mt-2 text-base leading-6 text-fg-primary">
                    {t('widget.productContainerBinding.allocationRequest.description', { productName })}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${signingDialogCornerControlClassName} start-2.75 w-auto max-w-[calc(100%-4rem)] gap-1 px-2`}
                  aria-label={t('common.action.back')}
                  onClick={handleHideSmartContractDetails}
                >
                  <ChevronLeft className="size-5 shrink-0" />
                  <span className="text-base leading-6">{t('common.action.back')}</span>
                </button>
              )}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!showSmartContractDetails ? (
                  <>
                    <div className={signingRawMessageCardClassName}>
                      <p className="text-base leading-6 text-fg-secondary">
                        {t('widget.productContainerBinding.allocationRequest.requestedResources')}
                      </p>
                      <ul className="flex flex-col gap-2 ps-6 text-base leading-6 text-fg-primary [&>li]:list-disc">
                        {otherResources.map((resource, index) => (
                          // eslint-disable-next-line react/no-array-index-key -- list is static for the modal's lifetime
                          <li key={`${resource.tag}-${index}`}>{renderOtherResourceLabel(resource)}</li>
                        ))}
                        {hasSmartContractDetails ? (
                          <li>{t('widget.productContainerBinding.allocationRequest.resource.SmartContractAllowance')}</li>
                        ) : null}
                      </ul>
                      {hasSmartContractDetails ? (
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth
                          aria-expanded={showSmartContractDetails}
                          onClick={handleShowSmartContractDetails}
                        >
                          {t('common.action.moreDetails')}
                        </Button>
                      ) : null}
                      {/* On the review screen, not just inside the details expansion — the user
                        should not have to expand to learn the accounts could not be resolved. */}
                      {hasAddressFailure ? (
                        <p className="text-sm leading-5 text-fg-error">{t('feature.browser.accountAddressUnavailable')}</p>
                      ) : null}
                    </div>

                    <div className="mt-auto flex w-full shrink-0 justify-center pt-4">
                      <p className="text-center text-sm leading-5 text-fg-secondary">
                        {t('widget.productContainerBinding.allocationRequest.polkadotAppHint')}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-8 overflow-y-auto pe-1 pt-14">
                    <p className="text-base leading-6 text-fg-primary">
                      {t('widget.productContainerBinding.allocationRequest.smartContractDetailsIntro')}
                    </p>
                    {smartContractResources.map((resource, position) => (
                      <SigningAccountDetailsSection
                        key={productAccountService.formatDerivationIndex(resource.value)}
                        label={t('widget.productContainerBinding.allocationRequest.appAccountWithIndex', {
                          index: productAccountService.formatDerivationIndex(resource.value),
                        })}
                        address={smartContractAddresses?.[position]}
                        failed={Boolean(smartContractAddressesError)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {error ? <p className="text-sm text-fg-error">{error}</p> : null}

              {!showSmartContractDetails ? (
                <SigningReviewFooter
                  cancelLabel={t('common.action.cancel')}
                  pending={false}
                  primaryDisabled={isAwaitingAddresses || hasAddressFailure}
                  primaryLabel={t('widget.productContainerBinding.allocationRequest.grantAccess')}
                  primaryPendingLabel={t('widget.productContainerBinding.allocationRequest.pending')}
                  onPrimary={handleApprove}
                />
              ) : null}
            </div>
          </>
        ))}
    </SSODialog.Root>
  );
});

AllocationRequestModal.displayName = 'AllocationRequestModal';
