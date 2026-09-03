import { useTransformer } from '@/shared/di';
import { folderItemContentTransformer } from '../../di';

type Props = {
  itemId: string;
};

// One favourites-folder cell's icon+label, resolved through the content seam.
// `useTransformer` runs once per cell instance (one hook per component, not a
// loop), so provider handlers can return hook-bound nodes. Renders nothing when
// no provider claims the id.
export const FolderItemContent = ({ itemId }: Props) => {
  const content = useTransformer(folderItemContentTransformer, { itemId });

  return content ?? null;
};
