import { createAccountService } from '@novasamatech/host-chat';
import { type LazyClient } from '@novasamatech/statement-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Environment, environmentUseCase } from '@/domains/application';

import { peerGateway } from './gateway';

vi.mock('@novasamatech/host-chat', () => ({
  createAccountService: vi.fn(() => ({})),
}));

const BACKEND_URL = 'https://backend.example';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(environmentUseCase, 'getById').mockImplementation(id =>
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- partial Environment; the resolver only reads backendUrl
    Promise.resolve({ id, backendUrl: BACKEND_URL } as Environment),
  );
});

describe('peerGateway.createPeerResolver', () => {
  // Regression for products-devnet-issues#1: the host-chat SDK appends
  // `usernames` directly to the endpoint, so it must be given the `/api/v1`
  // identity API base. With the bare backend root the search hits
  // `${backendUrl}/usernames` (the SPA index.html) and JSON parsing throws
  // "Unexpected token '<'".
  it('points the host-chat account service at the /api/v1 identity API base', async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- construction never touches the client
    await peerGateway.createPeerResolver({} as LazyClient, 'devnet');

    expect(createAccountService).toHaveBeenCalledWith(expect.objectContaining({ identityEndpoint: `${BACKEND_URL}/api/v1` }));
  });
});
