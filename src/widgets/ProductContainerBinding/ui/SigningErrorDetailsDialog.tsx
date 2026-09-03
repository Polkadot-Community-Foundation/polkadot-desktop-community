import { Button, Copy, Dialog } from '@novasamatech/tr-ui';
import { Copy as CopyIcon } from 'lucide-react';
import { memo } from 'react';

import { useTranslation } from '@/shared/translation';

import { SSODialog } from './SSODialog';
import { type SigningErrorState } from './signingErrorDetail';

type Props = {
  signingErrorState: SigningErrorState | null;
  onClose: VoidFunction;
};

export const SigningErrorDetailsDialog = memo(({ signingErrorState, onClose }: Props) => {
  const { t } = useTranslation();
  const open = signingErrorState !== null;
  const detailsJson = signingErrorState?.detailsJson ?? '';
  const errorMessage = signingErrorState?.message ?? '';
  const errorName = signingErrorState?.name ?? '';

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  };

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        aria-describedby={undefined}
        showCloseButton
        variant="default"
        onOpenAutoFocus={event => event.preventDefault()}
      >
        <div className="flex min-h-0 w-full max-w-[min(100vw-2rem,480px)] min-w-0 flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2 text-fg-primary">
            <SSODialog.Title>{t('feature.browser.signingFailedTitle')}</SSODialog.Title>
            <p className="text-base leading-6 font-normal break-all">{errorMessage}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {errorName.length > 0 ? (
              <>
                <p className="min-w-0 text-start text-base leading-6 font-normal wrap-break-word text-fg-primary">{errorName}</p>
                <div className="h-px w-full shrink-0 bg-stroke-primary" role="separator" />
              </>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex flex-row items-center justify-between gap-2">
                <span className="text-base leading-6 font-normal text-fg-secondary">
                  {t('feature.browser.signingErrorDetailsLabel')}
                </span>
                <Copy value={detailsJson}>
                  <Button type="button" variant="ghost" size="icon" aria-label={t('feature.browser.signingErrorCopyDetails')}>
                    <CopyIcon className="size-4" />
                  </Button>
                </Copy>
              </div>
              <div className="max-h-61 min-h-9 overflow-y-auto rounded-lg border border-stroke-primary bg-bg-surface-nested p-3">
                <pre className="font-mono text-sm leading-5 break-all whitespace-pre-wrap text-fg-primary">{detailsJson}</pre>
              </div>
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
});

SigningErrorDetailsDialog.displayName = 'SigningErrorDetailsDialog';
