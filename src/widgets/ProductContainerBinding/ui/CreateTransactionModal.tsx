import {
  type CodecType,
  type ProductAccountId,
  type ProductAccountTransaction,
  CreateTransactionErr,
} from '@novasamatech/host-api';
import { type UserSession } from '@novasamatech/host-papp';
import { Button, Copy, toastError } from '@novasamatech/tr-ui';
import { toHex } from '@polkadot-api/utils';
import { ChevronLeft, Copy as CopyIcon, Info } from 'lucide-react';
import { type Transaction } from 'polkadot-api';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as v from 'valibot';

import { TEST_IDS } from '@/shared/test-ids';
import { useTranslation } from '@/shared/translation';
import { amountToString } from '@/shared/utils';
import { chainService, genesisHash, useAllChainsMap, useApi } from '@/domains/network';
import { productAccountService, useProductAccountAddress } from '@/domains/product';
import { usePeopleChainStatus } from '@/aggregates/network-settings';
import { useProductSubtreeGate } from '../integrations/productSubtree';
import { type CreateTransactionResult } from '../types';
import { withAllowanceRenewal } from '../withAllowanceRenewal';
import { withSigningTimeout } from '../withSigningTimeout';

import { SSODialog } from './SSODialog';
import {
  SigningAccountDetailsSection,
  SigningPolkadotAppHint,
  SigningProductHeader,
  SigningReviewFooter,
  TxArgumentsJson,
  humanizeCallSegment,
  normalizeCallSegment,
  signingDetailCodeBlockClassName,
  signingDetailMonoSingleLineClassName,
  signingDialogCornerControlClassName,
  signingSummarySectionClassName,
  stringifyTxArguments,
} from './signingModalParts';

type TransactionRequest = Omit<CodecType<typeof ProductAccountTransaction>, 'signer'>;

type Props = {
  session: UserSession;
  transaction: TransactionRequest;
  productAccountId: CodecType<typeof ProductAccountId>;
  productIdentifier: string;
  flowId?: string;
  onCancel: (error: unknown) => void;
  onResult: (result: CreateTransactionResult) => void;
};

export const CreateTransactionModal = memo(
  ({ session, transaction, productAccountId, productIdentifier, flowId, onCancel, onResult }: Props) => {
    const tag = flowId ? `[Signing][${flowId}][CreateTransaction]` : '[Signing][CreateTransaction]';
    useEffect(() => {
      console.info(`${tag} modal mounted`);
      return () => console.info(`${tag} modal unmounted`);
    }, [tag]);
    const { t } = useTranslation();
    const derivationPath = productAccountService.formatDerivationPath(productAccountId);

    const { ready: subtreeReady, requestStep: subtreeStep } = useProductSubtreeGate(session, productAccountId[0], {
      onReject: () => onCancel(new CreateTransactionErr.Rejected()),
    });
    const { data: derivedAddress, error: derivedAddressError } = useProductAccountAddress(
      subtreeReady ? session : null,
      productAccountId[0],
      productAccountId[1],
    );
    const { data: chains } = useAllChainsMap();
    const { status: peopleChainStatus } = usePeopleChainStatus();

    // v0.9: `genesisHash` arrives as a hex string on the wire payload.
    const genesisHashHex = transaction.genesisHash;
    const callDataHex = toHex(transaction.callData);

    const signStartedRef = useRef(false);
    const reviewRejectionToastShownRef = useRef(false);
    const [step, setStep] = useState<'review' | 'polkadotApp'>('review');
    const [pending, setPending] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [feeLoading, setFeeLoading] = useState(false);
    const [feePartial, setFeePartial] = useState<bigint | null>(null);

    const sign = () => {
      const startedAt = Date.now();
      console.info(`${tag} sign() started — calling session.createTransaction`, {
        derivedAddress,
        genesisHash: genesisHashHex,
      });
      setPending(true);
      const startSignFlow = () =>
        session.createTransaction({
          payload: {
            tag: 'v1',
            value: {
              signer: productAccountId,
              genesisHash: transaction.genesisHash,
              callData: transaction.callData,
              extensions: transaction.extensions,
              txExtVersion: transaction.txExtVersion,
            },
          },
        });
      withAllowanceRenewal(() => withSigningTimeout(startSignFlow()))
        .andTee(() => {
          console.info(`${tag} response received from remote signer in ${Date.now() - startedAt}ms`);
          setPending(false);
        })
        .orTee(error => {
          console.error(
            `${tag} createTransaction failed after ${Date.now() - startedAt}ms`,
            error instanceof Error ? error.message : error,
          );
          setPending(false);
        })
        .match(
          signedTransaction => {
            console.info(`${tag} calling onResult`);
            onResult({ signedTransaction });
          },
          e => {
            const reason = e instanceof Error ? e.message : String(e);
            console.warn(`${tag} calling onCancel — ${reason}`);
            onCancel(new CreateTransactionErr.Unknown({ reason }));
          },
        );
    };

    const parsedChainId = v.parse(genesisHash, genesisHashHex);
    const chain = chains[parsedChainId] ?? null;

    const canInspectSigning = chain !== null && chainService.canInspectSigning(chain);

    const { api } = useApi(canInspectSigning ? chain : null);

    const [tx, setTx] = useState<Transaction | null>(null);

    useEffect(() => {
      if (!api) return;
      let cancelled = false;
      api.api.txFromCallData(transaction.callData).then(next => {
        if (!cancelled) setTx(next);
      });
      return () => {
        cancelled = true;
      };
    }, [api, transaction.callData]);

    useEffect(() => {
      // The address is fetched now (RFC-0022), so fee estimation has to wait for it.
      if (!tx || derivedAddress === undefined) {
        setFeePartial(null);
        setFeeLoading(false);
        return;
      }

      let cancelled = false;
      setFeeLoading(true);
      tx.getPaymentInfo(derivedAddress)
        .then(info => {
          if (!cancelled) {
            setFeePartial(info.partial_fee);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFeePartial(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setFeeLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [tx, derivedAddress]);

    const nativeAsset = useMemo(() => {
      if (!canInspectSigning || !chain) return null;
      return chainService.getNativeAsset(chain.assets);
    }, [canInspectSigning, chain]);

    const callInfo = useMemo(() => {
      if (!tx) {
        return null;
      }
      return { section: tx.decodedCall.type, method: tx.decodedCall.value.type };
    }, [tx]);

    const titleCall = useMemo(() => {
      if (!callInfo) {
        return null;
      }

      const key = `${normalizeCallSegment(callInfo.section)}.${normalizeCallSegment(callInfo.method)}`;

      const localizedTitleMap: Record<string, string> = {
        'utility.batchall': t('feature.browser.operationTitle.utilityBatchAll'),
        'utility.batch': t('feature.browser.operationTitle.utilityBatch'),
        'utility.forcebatch': t('feature.browser.operationTitle.utilityForceBatch'),
      };

      const localizedTitle = localizedTitleMap[key];
      if (localizedTitle) {
        return localizedTitle;
      }

      const pallet = humanizeCallSegment(callInfo.section);
      const method = humanizeCallSegment(callInfo.method);
      return `${pallet} ${method}`.trim();
    }, [callInfo, t]);

    const batchBehaviorHint = useMemo(() => {
      if (!callInfo) {
        return null;
      }

      const key = `${normalizeCallSegment(callInfo.section)}.${normalizeCallSegment(callInfo.method)}`;

      switch (key) {
        case 'utility.batchall':
          return t('feature.browser.batchBehavior.revertOnError');
        case 'utility.batch':
          return t('feature.browser.batchBehavior.executeUntilError');
        case 'utility.forcebatch':
          return t('feature.browser.batchBehavior.ignoreErrors');
        default:
          return null;
      }
    }, [callInfo, t]);

    const requestTitle =
      titleCall !== null ? t('feature.browser.signingRequestTitle', { call: titleCall }) : t('feature.browser.signTransaction');

    const argumentsJson = useMemo(() => {
      if (!tx) {
        return '{}';
      }
      return stringifyTxArguments(tx.decodedCall.value.value);
    }, [tx]);

    const feeDisplay = useMemo(() => {
      if (feeLoading) {
        return '…';
      }
      if (feePartial === null || !nativeAsset) {
        return t('feature.browser.feeUnavailable');
      }
      const amount = amountToString(feePartial, nativeAsset.precision);
      return `${amount} ${nativeAsset.symbol}`;
    }, [feeLoading, feePartial, nativeAsset, t]);

    const dismissReviewWithRejectedToast = useCallback(() => {
      if (reviewRejectionToastShownRef.current) {
        return;
      }
      reviewRejectionToastShownRef.current = true;
      toastError({ title: t('feature.browser.transactionSigningRejected') });
      onCancel(new CreateTransactionErr.Rejected());
    }, [onCancel, t]);

    const handleToggleDetails = () => {
      setShowDetails(v => !v);
    };

    const handleContinueToSign = () => {
      if (signStartedRef.current) {
        return;
      }
      signStartedRef.current = true;
      setStep('polkadotApp');
      sign();
    };

    return (
      <SSODialog.Root onDismiss={dismissReviewWithRejectedToast}>
        {subtreeStep ??
          (step === 'polkadotApp' ? (
            <SSODialog.WaitingForMobile
              lifetimeMs={null}
              session={session}
              onAbort={() => onCancel(new CreateTransactionErr.Rejected())}
            />
          ) : (
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6">
              {!showDetails ? <SigningProductHeader identifier={productIdentifier} /> : null}

              {!showDetails ? (
                <div className="pt-2">
                  <SSODialog.Title>
                    <span data-testid={TEST_IDS.signReviewCallTitle}>{requestTitle}</span>
                  </SSODialog.Title>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${signingDialogCornerControlClassName} start-2.75`}
                  aria-label={t('common.action.back')}
                  onClick={handleToggleDetails}
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!showDetails ? (
                  <>
                    <div className={signingSummarySectionClassName}>
                      {!canInspectSigning ? (
                        <>
                          <div className="flex items-center gap-2" data-testid={TEST_IDS.signReviewCustomChainWarning}>
                            <Info aria-hidden className="size-4 shrink-0 text-fg-warning" />
                            <p className="text-sm leading-5 text-fg-secondary">
                              {t('feature.browser.customChainSigningWarning')}
                            </p>
                          </div>
                          <div className="border-t border-stroke-primary" role="separator" />
                        </>
                      ) : null}
                      {canInspectSigning && batchBehaviorHint ? (
                        <>
                          <div className="flex items-center gap-2" data-testid={TEST_IDS.signReviewBatchHint}>
                            <Info aria-hidden className="size-4 shrink-0 text-fg-secondary" />
                            <p className="text-sm leading-5 text-fg-secondary">{batchBehaviorHint}</p>
                          </div>
                          <div className="border-t border-stroke-primary" role="separator" />
                        </>
                      ) : null}
                      <div className="flex items-start justify-between gap-3" data-testid={TEST_IDS.signReviewAccount}>
                        <span className="text-base leading-6 text-fg-secondary">{t('feature.browser.account')}</span>
                        <span className="max-w-[65%] truncate font-mono text-base leading-6 text-fg-primary">
                          {derivationPath}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3" data-testid={TEST_IDS.signReviewNetwork}>
                        <span className="text-base leading-6 text-fg-secondary">{t('feature.browser.network')}</span>
                        <div className="flex max-w-[65%] min-w-0 items-center justify-end gap-2">
                          <span className="truncate text-end text-base leading-6 text-fg-primary">
                            {chain?.name ?? genesisHashHex}
                          </span>
                        </div>
                      </div>
                      {canInspectSigning ? (
                        <div
                          className="flex items-start justify-between gap-3 text-base leading-6 text-fg-secondary"
                          data-testid={TEST_IDS.signReviewFee}
                        >
                          <span>{t('feature.browser.networkFee')}</span>
                          <span className="text-end text-fg-primary">{feeDisplay}</span>
                        </div>
                      ) : null}
                      <div className="mt-1 w-full">
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth
                          aria-expanded={showDetails}
                          data-testid={TEST_IDS.signReviewMoreDetails}
                          onClick={handleToggleDetails}
                        >
                          {showDetails ? t('common.action.hideDetails') : t('common.action.moreDetails')}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-auto flex w-full shrink-0 justify-center pt-4">
                      <SigningPolkadotAppHint />
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-8 overflow-y-auto pe-1 pt-14">
                    <SigningAccountDetailsSection
                      label={t('feature.browser.signingByAppAccount', {
                        index: productAccountService.formatDerivationIndex(productAccountId[1]),
                      })}
                      address={derivedAddress}
                      failed={Boolean(derivedAddressError)}
                    />
                    <section className="flex flex-col gap-3" data-testid={TEST_IDS.signReviewArguments}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base leading-6 text-fg-secondary">{t('common.label.arguments')}</span>
                        <Copy value={argumentsJson}>
                          <Button type="button" variant="ghost" size="icon" aria-label={t('feature.browser.copyArguments')}>
                            <CopyIcon className="size-4" />
                          </Button>
                        </Copy>
                      </div>
                      <div className={signingDetailCodeBlockClassName}>
                        <TxArgumentsJson value={tx?.decodedCall.value.value} />
                      </div>
                    </section>
                    <section className="flex flex-col gap-3" data-testid={TEST_IDS.signReviewCallData}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base leading-6 text-fg-secondary">{t('common.label.callData')}</span>
                        <Copy value={callDataHex}>
                          <Button type="button" variant="ghost" size="icon" aria-label={t('feature.browser.copyCallData')}>
                            <CopyIcon className="size-4" />
                          </Button>
                        </Copy>
                      </div>
                      <div className={signingDetailCodeBlockClassName}>
                        <div className={signingDetailMonoSingleLineClassName}>{callDataHex}</div>
                      </div>
                    </section>
                  </div>
                )}
              </div>

              {!showDetails ? (
                <SigningReviewFooter
                  cancelLabel={t('common.action.cancel')}
                  primaryLabel={t('feature.browser.continueToSign')}
                  primaryPendingLabel={t('common.action.signing')}
                  pending={pending}
                  primaryDisabled={peopleChainStatus !== 'connected' || derivedAddress === undefined}
                  primaryTestId={TEST_IDS.signReviewContinueButton}
                  onPrimary={handleContinueToSign}
                />
              ) : null}
            </div>
          ))}
      </SSODialog.Root>
    );
  },
);

CreateTransactionModal.displayName = 'CreateTransactionModal';
