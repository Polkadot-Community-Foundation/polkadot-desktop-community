import { nanoid } from 'nanoid';
import { type Observable, from, lastValueFrom, map, merge } from 'rxjs';

import { type AccountId } from '@/domains/network';
import { commitmentUseCase, productsResource } from '@/domains/product';
import { chatDatabase, findProductRoomBySessionId } from '../product/repository';
import {
  createMessageInProductRoom,
  deleteMessagesInProductRoom,
  deleteProductRoom,
  markProductMessagesAsRead,
  messagesResource,
  roomsResource,
} from '../product/resource';
import { productChatService } from '../product/service';
import { type ProductChatRoom } from '../product/types';
import { chatMessageService } from '../session/service';
import { type ChatMessage, type ChatSession, type MessageContent, type UserPeer } from '../session/types';

type CreateRoomParams = {
  roomId: string;
  userId: AccountId;
  productId: string;
};

async function createProductRoom(params: CreateRoomParams): Promise<{ room: ProductChatRoom; status: 'New' | 'Exists' } | null> {
  const { roomId, userId, productId } = params;

  // Commit the product BEFORE creating the room — every chat reference must
  // resolve to a durable Product record.
  const committed = await commitmentUseCase.commitProductByIdentifier(productId);
  if (!committed) return null;

  const sessionId = productChatService.getSessionId(productId, roomId, userId);
  const existing = await findProductRoomBySessionId(sessionId);
  if (existing) return { room: existing, status: 'Exists' };

  const room: ProductChatRoom = {
    sessionId,
    roomId,
    productId,
    userId,
    createdAt: Date.now(),
  };
  await chatDatabase.rooms.add(room);
  return { room, status: 'New' };
}

// The worker's room list must survive a restart, so it is read from storage
// rather than from any in-process registry.
function watchProductRooms(params: { productId: string; userId: AccountId }): Observable<ProductChatRoom[]> {
  return roomsResource
    .read$({ accountId: params.userId })
    .pipe(map(rooms => rooms.filter(room => productChatService.belongsToProduct(room, params.productId))));
}

function createProductChatSession(peer: UserPeer, room: ProductChatRoom): ChatSession {
  const name = productsResource
    .read$({})
    .pipe(map(records => records.find(r => r.baseName === room.productId)?.displayName ?? room.productId));
  const messages = messagesResource.read$(room);
  // TODO implement
  const participants = from([]);
  const lastMessage = messages.pipe(
    map(x => {
      for (let i = x.length - 1; i >= 0; i--) {
        const m = x[i];
        if (m && chatMessageService.isStandaloneMessage(m.content)) {
          return m;
        }
      }

      return null;
    }),
  );
  const unreadCount = messages.pipe(
    map(x =>
      x.reduce((acc, m) => {
        if (m.content.type === 'reacted' || m.content.type === 'reactionRemoved') return acc;

        return acc + (m.status.direction === 'incoming' && m.status.state === 'new' ? 1 : 0);
      }, 0),
    ),
  );

  return {
    sessionId: room.sessionId,
    roomId: room.roomId,
    participants,
    name,
    messages,
    lastMessage,
    unreadCount,

    async sendMessage(content: MessageContent) {
      const messageId = nanoid(32);
      const now = Date.now();

      const message: ChatMessage = {
        messageId,
        sessionId: room.sessionId,
        peer,
        content,
        timestamp: now,
        status: {
          direction: 'outgoing',
          state: 'sent',
        },
      };

      await lastValueFrom(createMessageInProductRoom(message));

      return { messageId };
    },

    async markAsRead() {
      await lastValueFrom(markProductMessagesAsRead(room));
    },

    async deleteSession() {
      await lastValueFrom(merge(deleteMessagesInProductRoom(room), deleteProductRoom(room)));
    },
  };
}

export const productRoomUseCase = {
  createProductRoom,
  createProductChatSession,
  watchProductRooms,
};
