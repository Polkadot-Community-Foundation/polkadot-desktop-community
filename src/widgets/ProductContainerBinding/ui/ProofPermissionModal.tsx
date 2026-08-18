import { Button, Dialog } from '@novasamatech/tr-ui';
import { AlertTriangle } from 'lucide-react';
import { memo } from 'react';

import { TEST_IDS } from '@/shared/test-ids';
import { useTranslation } from '@/shared/translation';
import { type Product } from '@/domains/product';
import { ProductDialogHeader } from '@/widgets/ProductDialogHeader';

type Props = {
  product: Nullable<Product>;
  requestedIdentifier: string;
  onAllow: VoidFunction;
  onDeny: VoidFunction;
  onDismiss: VoidFunction;
};

export const ProofPermissionModal = memo(({ product, requestedIdentifier, onAllow, onDeny, onDismiss }: Props) => {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onDismiss();
      }}
    >
      <Dialog.Content
        variant="default"
        showCloseButton
        onOpenAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
      >
        <div className="contents" data-testid={TEST_IDS.proofPermissionDialog} />
        <ProductDialogHeader product={product} />

        <div className="flex flex-col gap-2 py-3">
          <Dialog.Title>
            <span className="text-2xl leading-8 font-semibold text-fg-primary">
              {t('widget.productContainerBinding.proofPermission.title', { requestedIdentifier })}
            </span>
          </Dialog.Title>
          <Dialog.Description>
            <span className="text-base leading-6 font-normal text-fg-primary">
              {t('widget.productContainerBinding.proofPermission.subtitle')}
            </span>
          </Dialog.Description>
        </div>

        <div className="flex w-full items-start gap-2 rounded-lg border border-stroke-primary bg-bg-status-warning/10 p-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-fg-warning" />
          <p className="text-sm leading-5 font-medium text-fg-primary">
            {t('widget.productContainerBinding.proofPermission.warning')}
          </p>
        </div>
        <Dialog.Footer>
          <div className="flex w-full min-w-0 gap-2">
            <div className="min-w-0 flex-1">
              <Button type="button" variant="outline" fullWidth onClick={onDeny}>
                {t('widget.productContainerBinding.proofPermission.deny')}
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <Button type="button" variant="default" fullWidth data-testid={TEST_IDS.proofPermissionAllow} onClick={onAllow}>
                {t('widget.productContainerBinding.proofPermission.allow')}
              </Button>
            </div>
          </div>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
});
