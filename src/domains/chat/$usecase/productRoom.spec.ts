import { Subject, defer, firstValueFrom, of } from 'rxjs';
import { parse } from 'valibot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accountId } from '@/domains/network';
import { type ProductChatRoom } from '../product/types';
import { type ChatMessage } from '../session/types';

const persisted: ChatMessage[] = [];
const roomsSubject = new Subject<ProductChatRoom[]>();
const roomsReadParams: { accountId: string }[] = [];

vi.mock('@/domains/product', () => ({
  commitmentUseCase: { commitProductByIdentifier: vi.fn().mockResolvedValue(true) },
  productsResource: { read$: () => of([]) },
}));

vi.mock('../product/resource', () => ({
  createMessageInProductRoom: (message: ChatMessage) => {
    persisted.push(message);
    return of(undefined);
  },
  deleteMessagesInProductRoom: () => of(undefined),
  deleteProductRoom: () => of(undefined),
  markProductMessagesAsRead: () => of(undefined),
  // Keyed per room: every session object for the same room observes one stream.
  messagesResource: {
    read$: (room: ProductChatRoom) => defer(() => of(persisted.filter(m => m.sessionId === room.sessionId))),
  },
  roomsResource: {
    read$: (params: { accountId: string }) => {
      roomsReadParams.push(params);

      return roomsSubject.asObservable();
    },
  },
}));

const { productRoomUseCase } = await import('./productRoom');

const userId = parse(accountId, '0xuser');

const peer = { type: 'user' as const, accountId: userId, name: 'Alice' };

const room: ProductChatRoom = {
  sessionId: 'product:coinflip:room-1:0xuser',
  roomId: 'room-1',
  productId: 'coinflipgame03.dot',
  userId,
  createdAt: 1000,
};

describe('watchProductRooms', () => {
  beforeEach(() => {
    roomsReadParams.length = 0;
  });

  it('reads the resource keyed by the requesting user', async () => {
    const emission = firstValueFrom(productRoomUseCase.watchProductRooms({ productId: 'alpha.dot', userId }));
    roomsSubject.next([]);
    await emission;

    expect(roomsReadParams).toEqual([{ accountId: userId }]);
  });

  it('emits only the rooms of the requested product', async () => {
    const emission = firstValueFrom(productRoomUseCase.watchProductRooms({ productId: 'alpha.dot', userId }));
    roomsSubject.next([
      { sessionId: '0xa', roomId: 'room-a', productId: 'alpha.dot', userId, createdAt: 1 },
      { sessionId: '0xb', roomId: 'room-b', productId: 'beta.dot', userId, createdAt: 2 },
    ]);

    await expect(emission).resolves.toEqual([
      { sessionId: '0xa', roomId: 'room-a', productId: 'alpha.dot', userId, createdAt: 1 },
    ]);
  });

  it('tracks live inserts, so a room added after subscribe still reaches the worker', () => {
    const seen: ProductChatRoom[][] = [];
    const subscription = productRoomUseCase
      .watchProductRooms({ productId: 'alpha.dot', userId })
      .subscribe(rooms => seen.push(rooms));

    roomsSubject.next([]);
    roomsSubject.next([{ sessionId: '0xa', roomId: 'room-a', productId: 'alpha.dot', userId, createdAt: 1 }]);
    subscription.unsubscribe();

    expect(seen).toHaveLength(2);
    expect(seen[1]).toHaveLength(1);
  });
});

describe('createProductChatSession', () => {
  beforeEach(() => {
    persisted.length = 0;
  });

  it('surfaces a send on a session object built independently of the sender', async () => {
    // Chat UI and ProductWorker build separate session objects for the same room;
    // a send through one must be observable through the other.
    const uiSession = productRoomUseCase.createProductChatSession(peer, room);
    const workerSession = productRoomUseCase.createProductChatSession(peer, room);

    await uiSession.sendMessage({ type: 'text', text: 'Hello!' });

    const messages = await firstValueFrom(workerSession.messages);
    expect(messages.map(m => m.content)).toContainEqual({ type: 'text', text: 'Hello!' });
  });

  it('persists a send as outgoing so it is distinguishable from a worker reply', async () => {
    const session = productRoomUseCase.createProductChatSession(peer, room);

    const { messageId } = await session.sendMessage({ type: 'text', text: 'Ping' });

    expect(persisted.find(m => m.messageId === messageId)?.status.direction).toBe('outgoing');
  });

  it('scopes messages to their own room', async () => {
    const otherRoom: ProductChatRoom = { ...room, sessionId: 'product:coinflip:room-2:0xuser', roomId: 'room-2' };

    const session = productRoomUseCase.createProductChatSession(peer, room);
    const otherSession = productRoomUseCase.createProductChatSession(peer, otherRoom);

    await session.sendMessage({ type: 'text', text: 'Only room 1' });

    const messages = await firstValueFrom(otherSession.messages);
    expect(messages.map(m => m.content)).not.toContainEqual({ type: 'text', text: 'Only room 1' });
  });
});
