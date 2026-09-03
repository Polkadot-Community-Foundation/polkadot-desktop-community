import { type ReactNode } from 'react';

import { type DashboardCard } from '@/domains/application';

export type WidgetSize = {
  w: number;
  h: number;
};

// Props passed to dashboardCardContentTransformer handlers. Carries the
// current grid sizing + interaction callbacks; the handler decides what to
// render (and how) for its payload kind.
export type CardRenderProps = {
  card: DashboardCard;
  menuId: string;
  isMenuOpen: boolean;
  isActivePage: boolean;
  width: number;
  height: number;
  onMenuOpenChange: (menuId: string, open: boolean) => void;
  onResizeCard: (size: WidgetSize) => void;
  onRemoveCard: () => void;
  onCleanupCards: () => void;
  onOpenAddWidgetModal?: VoidFunction;
};

// Visual metadata for one card kind, consumed by `DashboardCardChrome` to
// fill in the topbar. All fields are optional: cards that opt out of the
// chrome (e.g. shortcut-sized product widgets) simply don't register one.
export type DashboardCardMetadata = {
  label?: ReactNode;
  icon?: ReactNode;
  removeLabel?: ReactNode;
};
