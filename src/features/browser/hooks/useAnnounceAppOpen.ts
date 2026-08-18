import { useEffect, useRef } from 'react';
import { useObservable } from 'react-rx';

import { onProductModalityOpenedSideEffect } from '@/domains/product';
import { browserTabs } from '@/aggregates/browser-tabs';
import { PRODUCT } from '../tabs/helpers';

// Announce an app-modality open whenever a PRODUCT tab (id == product baseName)
// becomes the selected tab. System tabs (dashboard, new-tab, etc.) are skipped.
// Reads the derived `selectedTab$` so unrelated tab-list churn doesn't re-render
// this always-mounted binding, and keys on the derived product id (a primitive),
// so it fires once per open. The initial mount is skipped: a product restored as
// the selected tab at launch is not a fresh open, so it must not nag.
export const useAnnounceAppOpen = () => {
  const selectedTab = useObservable(browserTabs.selectedTab$, null);
  const productAppId = selectedTab?.type === PRODUCT ? selectedTab.id : null;

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (productAppId) void onProductModalityOpenedSideEffect.apply({ productId: productAppId, kind: 'app' });
  }, [productAppId]);
};
