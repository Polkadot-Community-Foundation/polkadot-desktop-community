import {
  type CodecType,
  type ProductAccountId,
  type VrfSignature,
  type VrfTranscriptItem,
  SignVrfErr,
} from '@novasamatech/host-api';
import { type UserSession } from '@novasamatech/host-papp';
import { toHex } from '@polkadot-api/utils';
import { AlertTriangle } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';

import { TEST_IDS } from '@/shared/test-ids';
import { useTranslation } from '@/shared/translation';
import { cnTw, toError } from '@/shared/utils';
import { productAccountService } from '@/domains/product';
import { mapSignVrfWireError } from '../integrations/signVrfError';
import { withAllowanceRenewal } from '../withAllowanceRenewal';
import { SIGNING_TIMEOUT_MS, withSigningTimeout } from '../withSigningTimeout';

import { SSODialog } from './SSODialog';
import {
  SigningProductHeader,
  SigningReviewFooter,
  signingDetailCodeBlockClassName,
  signingDetailMonoTextClassName,
  signingRawMessageCardClassName,
} from './signingModalParts';

const transcriptDecoder = new TextDecoder();

// The host replays the transcript verbatim (RFC-0023), so what this dialog shows is what gets
// signed. Labels are ASCII by convention, values are arbitrary bytes — hex unless the decode is
// printable text, so no byte is silently prettified away (invalid UTF-8 decodes to U+FFFD, which
// the printable test rejects).
function formatTranscriptBytes(bytes: Uint8Array): string {
  const text = transcriptDecoder.decode(bytes);

  return /^[ -~]+$/.test(text) ? text : toHex(bytes);
}

type Props = {
  session: UserSession;
  /** The product asking for the signature — may differ from the account's own product. */
  productIdentifier: string;
  productAccountId: CodecType<typeof ProductAccountId>;
  transcriptLabel: Uint8Array;
  items: CodecType<typeof VrfTranscriptItem>[];
  onResult: (signature: CodecType<typeof VrfSignature>) => void;
  onCancel: (error: unknown) => void;
};

export const SignVrfModal = memo(
  ({ session, productIdentifier, productAccountId, transcriptLabel, items, onResult, onCancel }: Props) => {
    const { t } = useTranslation();
    const signStartedRef = useRef(false);
    const [step, setStep] = useState<'review' | 'polkadotApp'>('review');

    const sign = () => {
      withAllowanceRenewal(() =>
        withSigningTimeout(session.signVrf({ productAccountId, productId: productIdentifier, transcriptLabel, items })),
      ).match(onResult, error => {
        console.error('[sign-vrf] host-side error', error);
        onCancel(mapSignVrfWireError(toError(error)));
      });
    };

    const handleApprove = () => {
      if (signStartedRef.current) {
        return;
      }
      signStartedRef.current = true;
      setStep('polkadotApp');
      sign();
    };

    // Only reached during the review step — `WaitingForMobile` overrides dismissal
    // while it is mounted, so no step check is needed here.
    const handleDismiss = useCallback(() => {
      onCancel(new SignVrfErr.Rejected());
    }, [onCancel]);

    return (
      <SSODialog.Root onDismiss={handleDismiss}>
        {step === 'polkadotApp' ? (
          <SSODialog.WaitingForMobile lifetimeMs={SIGNING_TIMEOUT_MS} session={session} onAbort={handleDismiss} />
        ) : (
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6" data-testid={TEST_IDS.signVrfDialog}>
            <SigningProductHeader identifier={productIdentifier} />

            <div className="pt-2">
              <SSODialog.Title>
                {t('widget.productContainerBinding.signVrf.title', { requestingIdentifier: productIdentifier })}
              </SSODialog.Title>
              <p className="mt-2 text-base leading-6 text-fg-primary">{t('widget.productContainerBinding.signVrf.subtitle')}</p>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div className={signingRawMessageCardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-base leading-6 text-fg-secondary">
                    {t('widget.productContainerBinding.signVrf.account')}
                  </span>
                  <span className="max-w-[65%] truncate font-mono text-base leading-6 text-fg-primary">
                    {productAccountService.formatDerivationPath(productAccountId)}
                  </span>
                </div>

                <div className="border-t border-stroke-primary" role="separator" />

                <span className="text-base leading-6 text-fg-secondary">
                  {t('widget.productContainerBinding.signVrf.transcript')}
                </span>
                <div className={cnTw(signingDetailCodeBlockClassName, 'flex flex-col gap-1')}>
                  <div className={cnTw(signingDetailMonoTextClassName, 'flex gap-2')}>
                    <span className="shrink-0 text-fg-secondary">
                      {t('widget.productContainerBinding.signVrf.transcriptLabel')}
                    </span>
                    <span className="min-w-0 break-all">{formatTranscriptBytes(transcriptLabel)}</span>
                  </div>
                  {items.map(item => (
                    <div
                      key={`${toHex(item.label)}-${toHex(item.value)}`}
                      className={cnTw(signingDetailMonoTextClassName, 'flex gap-2')}
                    >
                      <span className="shrink-0 text-fg-secondary">{formatTranscriptBytes(item.label)}</span>
                      <span className="min-w-0 break-all">{formatTranscriptBytes(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex w-full items-start gap-2 rounded-lg border border-stroke-primary bg-bg-status-warning/10 p-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-fg-warning" />
                <p className="text-sm leading-5 font-medium text-fg-primary">
                  {t('widget.productContainerBinding.signVrf.warning')}
                </p>
              </div>
            </div>

            <SigningReviewFooter
              cancelLabel={t('widget.productContainerBinding.signVrf.deny')}
              primaryLabel={t('widget.productContainerBinding.signVrf.allow')}
              primaryPendingLabel={t('common.action.signing')}
              pending={false}
              primaryTestId={TEST_IDS.signVrfAllow}
              onPrimary={handleApprove}
            />
          </div>
        )}
      </SSODialog.Root>
    );
  },
);

SignVrfModal.displayName = 'SignVrfModal';
