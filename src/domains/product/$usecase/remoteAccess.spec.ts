import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../permissions/resource', () => ({
  productPermissionsResource: { read$: vi.fn() },
}));
vi.mock('../permissions/broker', () => ({
  requestExternalUrlAccess: vi.fn(),
}));

import { requestExternalUrlAccess } from '../permissions/broker';
import { productPermissionsResource } from '../permissions/resource';
import { type ProductPermissions } from '../permissions/types';

import { remoteAccessUseCase } from './remoteAccess';

const { resolveRemoteUrlAccess, setRemoteAccessPromptPolicy } = remoteAccessUseCase;

function permissions(remotePermissions: ProductPermissions['remotePermissions']): ProductPermissions {
  return { productId: 'p.dot', devicePermissions: [], remotePermissions };
}

const call = () => resolveRemoteUrlAccess({ productId: 'p.dot', url: 'https://cdn.example.com/x.png', modality: 'app' });

beforeEach(() => {
  setRemoteAccessPromptPolicy(true);
  vi.mocked(requestExternalUrlAccess).mockReset();
  vi.mocked(productPermissionsResource.read$).mockReturnValue(of(permissions([])));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveRemoteUrlAccess', () => {
  it('returns a stored "granted" without prompting', async () => {
    vi.mocked(productPermissionsResource.read$).mockReturnValue(
      of(permissions([{ payload: { type: 'Remote', pattern: 'https://cdn.example.com' }, modality: 'app', status: 'granted' }])),
    );
    await expect(call()).resolves.toBe('granted');
    expect(requestExternalUrlAccess).not.toHaveBeenCalled();
  });

  it('returns a stored "denied" without prompting', async () => {
    vi.mocked(productPermissionsResource.read$).mockReturnValue(
      of(permissions([{ payload: { type: 'Remote', pattern: 'https://cdn.example.com' }, modality: 'app', status: 'denied' }])),
    );
    await expect(call()).resolves.toBe('denied');
    expect(requestExternalUrlAccess).not.toHaveBeenCalled();
  });

  it('prompts when the stored pattern rolls up to "ask"', async () => {
    vi.mocked(productPermissionsResource.read$).mockReturnValue(
      of(permissions([{ payload: { type: 'Remote', pattern: 'https://cdn.example.com' }, modality: 'app', status: 'ask' }])),
    );
    vi.mocked(requestExternalUrlAccess).mockResolvedValue('granted');
    await expect(call()).resolves.toBe('granted');
    expect(requestExternalUrlAccess).toHaveBeenCalledWith({
      productId: 'p.dot',
      url: 'https://cdn.example.com/x.png',
      modality: 'app',
    });
  });

  it('prompts when there is no matching stored pattern (policy on)', async () => {
    vi.mocked(requestExternalUrlAccess).mockResolvedValue('denied');
    await expect(call()).resolves.toBe('denied');
    expect(requestExternalUrlAccess).toHaveBeenCalledOnce();
  });

  it('denies unmatched silently without prompting when policy is off', async () => {
    setRemoteAccessPromptPolicy(false);
    await expect(call()).resolves.toBe('denied');
    expect(requestExternalUrlAccess).not.toHaveBeenCalled();
  });
});
