import { useCallback } from 'react';

import { useProductWorkerInstance } from '@/aggregates/product-workers';
import { type ActionHandler, type SubscribeToNode, CustomRenderer } from '@/widgets/CustomRenderer';

type Props = {
  productId: string;
  messageId: string;
  messageType: string;
  payload: Uint8Array;
  roomId: string;
};

const NO_SUBSCRIPTION = () => {};

/**
 * A message the product draws itself.
 *
 * Everything about *drawing* — the render tree and the visibility gate — belongs
 * to `CustomRenderer`, which the input surface uses for the same purpose. What is
 * chat's alone lives here: the tree comes from the room's product worker, and an
 * action goes back as a chat event naming this message.
 */
export const CustomMessage = ({ productId, messageId, messageType, payload, roomId }: Props) => {
  const instance = useProductWorkerInstance(productId);

  const subscribe = useCallback<SubscribeToNode>(
    onNode => {
      if (!instance) return NO_SUBSCRIPTION;

      const subscription = instance.container.renderChatCustomMessage({ messageId, messageType, payload }, onNode);

      return () => subscription.unsubscribe();
    },
    [instance, messageId, messageType, payload],
  );

  const onAction = useCallback<ActionHandler>(
    (actionId, value) => {
      // events.emit is a no-op after dispose (events.events is cleared first).
      instance?.events.emit('sendChatAction', roomId, productId, {
        tag: 'ActionTriggered',
        value: { messageId, actionId, payload: value },
      });
    },
    [instance, roomId, productId, messageId],
  );

  return <CustomRenderer subscribe={subscribe} onAction={onAction} />;
};
