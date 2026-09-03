import 'fake-indexeddb/auto';

import { lastValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { type ChatMessage } from '../session/types';

import { p2pChatDatabase } from './repository';
import { createP2PMessage, markP2PMessagesAsDelivered } from './resource';

const peer = { type: 'p2p' as const, accountId: 'peer-1', name: 'User B' };

const incoming = (state: 'new' | 'seen'): ChatMessage => ({
  messageId: 'm1',
  sessionId: 'peer-1',
  peer,
  timestamp: 1000,
  content: { type: 'text', text: 'Hi from iOS!' },
  status: { direction: 'incoming', state },
});

const outgoing = (state: 'new' | 'sent' | 'delivered'): ChatMessage => ({
  messageId: 'm2',
  sessionId: 'peer-1',
  peer,
  timestamp: 2000,
  content: { type: 'text', text: 'hello' },
  status: { direction: 'outgoing', state },
});

describe('createP2PMessage — status preservation on re-write', () => {
  beforeEach(async () => {
    await p2pChatDatabase.messages.clear();
  });

  it('inserts a brand-new incoming message as new (stays unread)', async () => {
    await lastValueFrom(createP2PMessage(incoming('new')));

    const row = await p2pChatDatabase.messages.get('m1');
    expect(row?.status).toEqual({ direction: 'incoming', state: 'new' });
  });

  it('does not regress incoming status from seen → new on history replay', async () => {
    // User opened the chat → the message was persisted as read.
    await p2pChatDatabase.messages.put(incoming('seen'));

    // App reloads → the session replays the on-chain statement, re-deriving the
    // same message with a hardcoded `new` status. The read marker must survive.
    await lastValueFrom(createP2PMessage(incoming('new')));

    const row = await p2pChatDatabase.messages.get('m1');
    expect(row?.status).toEqual({ direction: 'incoming', state: 'seen' });
  });

  it('upgrades incoming status from new → seen', async () => {
    await p2pChatDatabase.messages.put(incoming('new'));

    await lastValueFrom(createP2PMessage(incoming('seen')));

    const row = await p2pChatDatabase.messages.get('m1');
    expect(row?.status).toEqual({ direction: 'incoming', state: 'seen' });
  });

  it('does not regress outgoing status from delivered → new on re-derivation', async () => {
    await p2pChatDatabase.messages.put(outgoing('delivered'));

    await lastValueFrom(createP2PMessage(outgoing('new')));

    const row = await p2pChatDatabase.messages.get('m2');
    expect(row?.status).toEqual({ direction: 'outgoing', state: 'delivered' });
  });
});

describe('markP2PMessagesAsDelivered', () => {
  const outgoing = (messageId: string, timestamp: number, state: 'sent' | 'delivered'): ChatMessage => ({
    messageId,
    sessionId: 'peer-1',
    peer,
    timestamp,
    content: { type: 'text', text: messageId },
    status: { direction: 'outgoing', state },
  });

  beforeEach(async () => {
    await p2pChatDatabase.messages.clear();
  });

  it('advances only outgoing sent rows older than the cutoff', async () => {
    await lastValueFrom(createP2PMessage(outgoing('old', 1000, 'sent')));
    await lastValueFrom(createP2PMessage(outgoing('live', 3000, 'sent')));

    await lastValueFrom(markP2PMessagesAsDelivered({ sessionId: 'peer-1', before: 2000 }));

    // `old` predates the session, so the batch ack is the only signal it will get.
    expect((await p2pChatDatabase.messages.get('old'))?.status.state).toBe('delivered');
    // `live` has its own delivery waiter and may sit in a newer batch than the one acked.
    expect((await p2pChatDatabase.messages.get('live'))?.status.state).toBe('sent');
  });

  it('leaves incoming messages alone', async () => {
    await lastValueFrom(createP2PMessage(incoming('seen')));

    await lastValueFrom(markP2PMessagesAsDelivered({ sessionId: 'peer-1', before: 2000 }));

    expect((await p2pChatDatabase.messages.get('m1'))?.status.state).toBe('seen');
  });
});
