import { type Container } from '@novasamatech/host-container';
import { errAsync, okAsync } from 'neverthrow';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ProductWorkerInstance, type WorkerDeps } from './types';

const createProductRoomMock = vi.fn();
const watchProductRoomsMock = vi.fn((_params: unknown) => of([]));

vi.mock('@/domains/chat', () => ({
  createMessageInProductRoom: vi.fn(),
  productChatService: {
    getUserId: () => '0xuser',
    getSessionId: (productId: string, roomId: string, userId: string) => `${productId}:${roomId}:${userId}`,
  },
  productRoomUseCase: {
    createProductRoom: (params: unknown) => createProductRoomMock(params),
    watchProductRooms: (params: unknown) => watchProductRoomsMock(params),
  },
}));

const { chatCreateRoomBinding } = await import('./bindings');

type CreateRoomHandler = (params: { roomId: string }, responders: { ok: typeof okAsync; err: typeof errAsync }) => unknown;

function setup(options: { session?: object | null; disposed?: boolean } = {}) {
  let handler: CreateRoomHandler | null = null;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const container = {
    handleChatCreateRoom: (cb: CreateRoomHandler) => {
      handler = cb;

      return () => {};
    },
  } as unknown as Container;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const instance = {
    container,
    productId: 'coinflipgame03.dot',
    disposed: options.disposed ?? false,
  } as unknown as ProductWorkerInstance;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const deps = {
    getSession: () => (options.session === undefined ? {} : options.session),
  } as unknown as WorkerDeps;

  chatCreateRoomBinding(instance, deps);

  return {
    declareRoom: (roomId: string) => handler!({ roomId }, { ok: okAsync, err: errAsync }),
  };
}

describe('chatCreateRoomBinding', () => {
  beforeEach(() => {
    createProductRoomMock.mockReset();
  });

  it('reports New for a room that has just been persisted', async () => {
    createProductRoomMock.mockResolvedValue({ room: {}, status: 'New' });

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = (await setup().declareRoom('welcome-room')) as { _unsafeUnwrap: () => { status: string } };

    expect(result._unsafeUnwrap().status).toBe('New');
  });

  it('reports Exists for a room that storage already holds, so a restart does not re-greet', async () => {
    createProductRoomMock.mockResolvedValue({ room: {}, status: 'Exists' });

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = (await setup().declareRoom('welcome-room')) as { _unsafeUnwrap: () => { status: string } };

    expect(result._unsafeUnwrap().status).toBe('Exists');
  });

  it('passes the worker productId and the session userId through to the write', async () => {
    createProductRoomMock.mockResolvedValue({ room: {}, status: 'New' });

    await setup().declareRoom('welcome-room');

    expect(createProductRoomMock).toHaveBeenCalledWith({
      roomId: 'welcome-room',
      productId: 'coinflipgame03.dot',
      userId: '0xuser',
    });
  });

  it('errors when the room cannot be created', async () => {
    createProductRoomMock.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = (await setup().declareRoom('welcome-room')) as { isErr: () => boolean };

    expect(result.isErr()).toBe(true);
  });

  it('errors when the write throws instead of falling back to a re-greet', async () => {
    createProductRoomMock.mockRejectedValue(new Error('dexie is down'));

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = (await setup().declareRoom('welcome-room')) as { isErr: () => boolean };

    expect(result.isErr()).toBe(true);
  });

  it('denies the declaration when there is no session', async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = (await setup({ session: null }).declareRoom('welcome-room')) as { isErr: () => boolean };

    expect(result.isErr()).toBe(true);
    expect(createProductRoomMock).not.toHaveBeenCalled();
  });

  it('does not answer a worker that was disposed while the write was in flight', async () => {
    createProductRoomMock.mockResolvedValue({ room: {}, status: 'New' });

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = (await setup({ disposed: true }).declareRoom('welcome-room')) as { isErr: () => boolean };

    expect(result.isErr()).toBe(true);
  });
});
