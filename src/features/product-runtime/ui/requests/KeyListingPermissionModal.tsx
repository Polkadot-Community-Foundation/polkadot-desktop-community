import { type IdentityDisclosureReview } from '@parity/truapi-host';

import { TEST_IDS } from '@/shared/test-ids';
import { useTranslation } from '@/shared/translation';

import { PermissionRequestModal } from './PermissionRequestModal';

type Props = {
  review: IdentityDisclosureReview;
  onDecide: (approved: boolean) => void;
};

/** RFC-0024 key listing: the product wants to know which rings another product registered keys for. */
export const KeyListingPermissionModal = ({ review, onDecide }: Props) => {
  const { t } = useTranslation();

  return (
    <PermissionRequestModal
      identifier={review.productId}
      title={t('widget.productContainerBinding.keyListingPermission.title', { requestedIdentifier: review.productId })}
      subtitle={t('widget.productContainerBinding.keyListingPermission.subtitle')}
      warning={t('widget.productContainerBinding.keyListingPermission.warning')}
      denyLabel={t('widget.productContainerBinding.keyListingPermission.deny')}
      allowLabel={t('widget.productContainerBinding.keyListingPermission.allow')}
      dialogTestId={TEST_IDS.keyListingPermissionDialog}
      allowTestId={TEST_IDS.keyListingPermissionAllow}
      onAllow={() => onDecide(true)}
      onDeny={() => onDecide(false)}
    />
  );
};
