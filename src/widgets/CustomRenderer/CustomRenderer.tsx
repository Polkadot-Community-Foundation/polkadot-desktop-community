import { useEffect, useMemo, useRef, useState } from 'react';

import { useIntersectionObserver } from '@/shared/hooks';

import { type ActionHandler, type CustomNode, type SubscribeToNode } from './types';
import { renderNode } from './ui/renderNode';

type Props = {
  subscribe: SubscribeToNode;
  onAction: ActionHandler;
};

/**
 * Draws a product-authored render tree, subscribed only while it is on screen.
 *
 * The visibility gate is not a rendering optimization — it gates the
 * *subscription*. A tree is live: the product pushes a new one whenever its state
 * changes, and each open subscription is work its worker is doing. A long chat
 * history or a list of candidates would otherwise hold one per row, for rows
 * nobody is looking at, so the observer starts each subscription when its element
 * scrolls in and drops it when it leaves.
 *
 * Nothing here interprets the product's payload. The product draws; the host
 * frames what it drew and reports what the user did to it.
 */
export const CustomRenderer = ({ subscribe, onAction }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [node, setNode] = useState<CustomNode | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useIntersectionObserver(containerRef, entry => {
    setIsVisible(entry.isIntersecting);
  });

  useEffect(() => {
    if (!isVisible) return;

    return subscribe(setNode);
  }, [isVisible, subscribe]);

  // The tree is walked once per node, not once per parent render: a chat list
  // re-renders on every message, and the input surface on every keystroke.
  const tree = useMemo(() => (node ? renderNode(node, onAction) : null), [node, onAction]);

  return <div ref={containerRef}>{tree}</div>;
};
