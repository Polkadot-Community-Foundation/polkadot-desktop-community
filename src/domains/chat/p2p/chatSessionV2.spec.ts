import { describe, expect, it, vi } from 'vitest';

/**
 * Covers the two things this adapter decides on its own; everything else is the SDK's.
 *
 *  - what we ACK (a blanket 'success' would tell the peer we received a message this
 *    build dropped),
 *  - how a batch-level response reaches messages restored from a previous run, whose
 *    delivery tokens the SDK cannot restore.
 */

type Handler = (request: { payload: { status: string; value?: unknown } }) => string;
type SubscribeCallback = (messages: unknown[]) => void;

const captured = vi.hoisted((): { respondHandler: Nullable<Handler>; subscribeCallback: Nullable<SubscribeCallback> } => ({
  respondHandler: null,
  subscribeCallback: null,
}));

vi.mock('@novasamatech/statement-store', () => ({
  createAccountId: (bytes: Uint8Array) => bytes,
  createSr25519Prover: () => ({}),
  createMultiDeviceSession: () => ({
    subscribe: (_codec: unknown, callback: SubscribeCallback) => {
      captured.subscribeCallback = callback;

      return () => {};
    },
    respondToRequests: (_codec: unknown, handler: Handler) => {
      captured.respondHandler = handler;

      return () => {};
    },
    submitRequestMessage: () => ({ isErr: () => false, value: { requestId: 'req-1' } }),
    waitForResponseMessage: () => ({ match: () => {} }),
    dispose: () => {},
  }),
}));

import { createChatPeerSessionV2 } from './chatSessionV2';

const createSession = (overrides: { onBatchDelivered?: () => void } = {}) =>
  createChatPeerSessionV2({
    identityChatPrivateKey: new Uint8Array(32),
    ownIdentityAccountId: new Uint8Array(32),
    ownDeviceStatementAccountId: new Uint8Array(32),
    ownDeviceEncryptionPrivateKey: new Uint8Array(32),
    ownDeviceSeed: new Uint8Array(64),
    peerIdentityAccountId: new Uint8Array(32),
    peerIdentityChatPublicKey: new Uint8Array(32),
    peerRoster: { current: () => [], subscribe: () => () => {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions -- the SDK adapter is mocked above
    statementStore: {} as any,
    onMessage: () => {},
    onDelivered: () => {},
    onSent: () => {},
    ...overrides,
  });

describe('createChatPeerSessionV2 — acknowledgement', () => {
  it('acks a request it could decode', () => {
    createSession();

    expect(captured.respondHandler?.({ payload: { status: 'parsed', value: {} } })).toBe('success');
  });

  it('does NOT ack a request it could not decode', () => {
    createSession();

    // A blanket 'success' here advances the peer's message to ✓✓ for something we dropped.
    expect(captured.respondHandler?.({ payload: { status: 'failed' } })).toBe('decodingFailed');
  });
});

describe('createChatPeerSessionV2 — batch delivery', () => {
  it('reports a batch ack, which is the only delivery signal a restored message gets', () => {
    const onBatchDelivered = vi.fn();
    createSession({ onBatchDelivered });

    captured.subscribeCallback?.([{ type: 'response', localId: 'l1', requestId: 'req-0', responseCode: 'success' }]);

    expect(onBatchDelivered).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-success response', () => {
    const onBatchDelivered = vi.fn();
    createSession({ onBatchDelivered });

    captured.subscribeCallback?.([{ type: 'response', localId: 'l1', requestId: 'req-0', responseCode: 'decodingFailed' }]);

    expect(onBatchDelivered).not.toHaveBeenCalled();
  });
});
