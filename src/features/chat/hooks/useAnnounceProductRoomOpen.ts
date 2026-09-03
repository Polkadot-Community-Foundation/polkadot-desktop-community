import { useEffect, useRef } from 'react';

import { useUserProductRooms } from '@/domains/chat';
import { onProductModalityOpenedSideEffect } from '@/domains/product';

// Announce a worker-modality open when the user opens a PRODUCT chat room. The
// open session id (from the /chat route) is resolved to its product via the
// product-rooms list; P2P sessions have no product room and fire nothing. The
// effect keys on the resolved product id (a primitive), so it fires once per open.
// The initial mount is skipped: a product room restored as the open session at
// launch is not a fresh open, so it must not nag.
export const useAnnounceProductRoomOpen = (selectedSessionId: string | null) => {
  const { data: rooms } = useUserProductRooms();

  const productId = selectedSessionId ? (rooms.find(room => room.sessionId === selectedSessionId)?.productId ?? null) : null;

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (productId) void onProductModalityOpenedSideEffect.apply({ productId, kind: 'worker' });
  }, [productId]);
};
