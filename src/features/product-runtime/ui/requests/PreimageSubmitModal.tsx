import { type PreimageSubmitReview } from '@parity/truapi-host';

import { useTranslation } from '@/shared/translation';
import { productRuntimeService } from '../../service';

import { PermissionRequestModal } from './PermissionRequestModal';

type Props = {
  review: PreimageSubmitReview;
  onDecide: (approved: boolean) => void;
};

/**
 * Bulletin-chain preimage submission. No warning banner: the review names a size, and
 * the data is content-addressed and public by design — there is no lasting grant to warn about.
 *
 * The review carries only the size; the core does not name the submitting product
 * (upstream issue 6), so the header is omitted rather than guessed.
 */
export const PreimageSubmitModal = ({ review, onDecide }: Props) => {
  const { t } = useTranslation();

  return (
    <PermissionRequestModal
      identifier={null}
      title={t('feature.browser.storeDataRequest')}
      subtitle={t('feature.browser.storeDataDescription', { size: productRuntimeService.formatByteSize(review.size) })}
      denyLabel={t('feature.browser.storeDataDeny')}
      allowLabel={t('common.action.allow')}
      onAllow={() => onDecide(true)}
      onDeny={() => onDecide(false)}
    />
  );
};
