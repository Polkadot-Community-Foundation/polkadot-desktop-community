import { AccountId } from '@polkadot-api/substrate-bindings';
import { describe, expect, it } from 'vitest';

import { type SearchResult } from '../types';

import { peerSearchService } from './service';

const result = (candidateAccountId: string, username: string): SearchResult => ({
  candidateAccountId,
  username,
  status: 'ASSIGNED',
});

const SELF_KEY = new Uint8Array(32).fill(1);
const PEER_KEY = new Uint8Array(32).fill(2);

// Encode a public key to SS58 at a given network prefix (42 = generic substrate).
const ss58 = (publicKey: Uint8Array, prefix = 42): string => AccountId(prefix).dec(publicKey);

describe('peerSearchService.excludeSelfFromSearchResults', () => {
  it('drops the entry whose account matches the current user identity', () => {
    const results = [result(ss58(SELF_KEY), 'me'), result(ss58(PEER_KEY), 'alice')];

    const filtered = peerSearchService.excludeSelfFromSearchResults(results, SELF_KEY);

    expect(filtered).toEqual([result(ss58(PEER_KEY), 'alice')]);
  });

  it('keeps every entry when none matches the current user', () => {
    const results = [result(ss58(PEER_KEY), 'alice'), result(ss58(new Uint8Array(32).fill(3)), 'bob')];

    expect(peerSearchService.excludeSelfFromSearchResults(results, SELF_KEY)).toEqual(results);
  });

  it('drops all entries when only self matches', () => {
    const results = [result(ss58(SELF_KEY), 'me')];

    expect(peerSearchService.excludeSelfFromSearchResults(results, SELF_KEY)).toEqual([]);
  });

  it('matches self regardless of the SS58 network prefix the backend used', () => {
    // Same identity key, encoded under a different network prefix (2 = Kusama).
    const results = [result(ss58(SELF_KEY, 2), 'me'), result(ss58(PEER_KEY), 'alice')];

    const filtered = peerSearchService.excludeSelfFromSearchResults(results, SELF_KEY);

    expect(filtered).toEqual([result(ss58(PEER_KEY), 'alice')]);
  });
});
