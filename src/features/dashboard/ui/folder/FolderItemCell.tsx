import { AppIcon } from '@novasamatech/tr-ui';
import { type ReactNode } from 'react';

type Props = {
  // Resolved icon image URL (e.g. a product's loaded icon).
  iconUrl?: string;
  // Pre-rendered icon node (e.g. a native addable entry's own `icon`), used as-is.
  iconNode?: ReactNode;
  name: string;
};

// Presentational icon+label cell shared by the favourites-folder content
// providers. Mirrors the visual the folder rendered before the content seam, so
// resolvable items look identical regardless of which provider supplies them.
export const FolderItemCell = ({ iconUrl, iconNode, name }: Props) => {
  return (
    <span className="flex w-full flex-col items-center justify-center gap-2">
      <AppIcon size="md" src={iconUrl} alt={name}>
        {iconNode ? <span className="flex size-5 items-center justify-center overflow-hidden rounded-sm">{iconNode}</span> : null}
      </AppIcon>
      <span className="max-w-full truncate text-center text-sm leading-5 font-semibold text-fg-primary">{name}</span>
    </span>
  );
};
