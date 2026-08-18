import { type CodecType, type CustomRendererNode } from '@novasamatech/host-api';

/** One product-authored render tree, decoded off the wire. */
export type CustomNode = CodecType<typeof CustomRendererNode>;

/** What the user did to the tree, sent back to whoever drew it. */
export type ActionHandler = (actionId: string, value?: Uint8Array) => void;

/**
 * Opens the render-tree subscription and returns its teardown.
 *
 * The caller supplies this because *where* a tree comes from differs per surface
 * — a chat message subscribes through the product's worker container, and an
 * input candidate through the input-routing gateway — while the drawing and the
 * visibility gating are the same either way. Must be stable (`useCallback`): a
 * new identity resubscribes.
 */
export type SubscribeToNode = (onNode: (node: CustomNode) => void) => VoidFunction;
