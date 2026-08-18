import { type ChatMessageContent, type CodecType } from '@novasamatech/host-api';
import { useSession } from '@novasamatech/host-papp-react-ui';
import { memo, useEffect } from 'react';
import { type Subscription, concatMap, pairwise } from 'rxjs';

import { useLooseRef } from '@/shared/hooks';
import { type MessageContent, productChatService, useProductSessions } from '@/domains/chat';
import { type Product, permissionsService } from '@/domains/product';
import { useProductWorker } from '@/aggregates/product-workers';
import { ProductContainerBinding } from '@/widgets/ProductContainerBinding';

type ProductChatMessage = CodecType<typeof ChatMessageContent>;

type ProductWorkerProps = {
  product: Product;
};

// Null for kinds the durable stream carries but the worker must not receive.
function toProductChatMessage(content: MessageContent): ProductChatMessage | null {
  switch (content.type) {
    case 'text':
      return { tag: 'Text', value: content.text };
    case 'richText':
      return {
        tag: 'RichText',
        value: { text: content.text, media: [] },
      };
    case 'reacted':
      return { tag: 'Reaction', value: { messageId: content.messageId, emoji: content.emoji } };
    case 'reactionRemoved':
      return { tag: 'ReactionRemoved', value: { messageId: content.messageId, emoji: content.emoji } };
    default:
      return null;
  }
}

export const ProductWorker = memo(({ product }: ProductWorkerProps) => {
  const instance = useProductWorker(product);
  const { session } = useSession();
  const { data: chatSessions } = useProductSessions();

  // `useProductSessions` rebuilds its session objects on every recompute; keying the
  // effect on the room set instead of the array identity keeps live subscriptions in
  // place across those rebuilds, so a resubscribe never re-seeds the backlog.
  const chatSessionsRef = useLooseRef(chatSessions);
  const roomKey = chatSessions.map(s => s.sessionId).join(',');

  useEffect(() => {
    // Ceiling: the first snapshot after `instance` resolves is the backlog, and the
    // worker archive loads asynchronously — a message sent while it is still loading
    // is stored but lands in that first snapshot, so it is never relayed. Closing that
    // needs a per-room watermark persisted across runs; no caller has one today.
    if (!instance || !session) return;

    const userId = productChatService.getUserId(session);
    const subscriptions: Subscription[] = [];

    for (const chatSession of chatSessionsRef()) {
      const chatSessionId = productChatService.getSessionId(product.baseName, chatSession.roomId, userId);
      if (chatSession.sessionId !== chatSessionId) continue;

      const subscription = chatSession.messages
        .pipe(
          // The stream re-emits the room's whole list; pairwise() yields nothing until
          // the second snapshot, so the backlog present at subscribe never replays.
          pairwise(),
          concatMap(([previous, next]) => {
            const known = new Set(previous.map(m => m.messageId));

            // Worker replies persist as `incoming` (product/worker/bindings.ts) —
            // relaying those would feed the worker its own output.
            return next.filter(m => !known.has(m.messageId) && m.status.direction === 'outgoing');
          }),
        )
        .subscribe(message => {
          const payload = toProductChatMessage(message.content);
          if (!payload) return;

          const peer =
            message.peer.type === 'user' || message.peer.type === 'p2p' ? message.peer.accountId : message.peer.productId;
          // After dispose, instance.events.events is cleared, so emit becomes a no-op
          instance.events.emit('sendChatAction', chatSession.roomId, peer, { tag: 'MessagePosted', value: payload });
        });

      subscriptions.push(subscription);
    }

    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [instance, session, product.baseName, roomKey, chatSessionsRef]);

  if (!instance) return null;
  // Workers have no modality of their own — enforced against 'app' via the domain rule.
  return (
    <ProductContainerBinding
      container={instance.container}
      identifier={product.baseName}
      modality={permissionsService.modalityForKind('worker')}
    />
  );
});
