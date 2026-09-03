import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { P2PChatRequestSchema, P2PRoomSchema } from './schemas';

const base = {
  requestId: 'req-1',
  peerId: '0xpeer',
  direction: 'incoming' as const,
  status: 'pending' as const,
  timestamp: 0,
  userId: '0xuser',
};

describe('P2PChatRequestSchema — revealed', () => {
  it('round-trips the revealed flag when set', () => {
    const parsed = v.parse(P2PChatRequestSchema, { ...base, revealed: true });
    expect(parsed.revealed).toBe(true);
  });

  it('keeps revealed optional for rows that pre-date the column', () => {
    const parsed = v.parse(P2PChatRequestSchema, base);
    expect(parsed.revealed).toBeUndefined();
  });
});

describe('P2PRoomSchema', () => {
  const room = {
    sessionId: '0xpeer',
    peerId: '0xpeer',
    peerUsername: 'alice',
    userId: '0xuser',
    createdAt: 0,
  };

  it('accepts a row still carrying a dropped column, so existing rooms survive', () => {
    // `resource.ts` filters rows through `v.is` and drops the failures. A row
    // written before a column was removed must stay readable, or the user's
    // chat list empties itself on upgrade.
    expect(v.is(P2PRoomSchema, { ...room, peerP256PublicKey: '0x04dead' })).toBe(true);
  });

  it('rejects a row missing a required column', () => {
    const { peerUsername: _dropped, ...incomplete } = room;
    expect(v.is(P2PRoomSchema, incomplete)).toBe(false);
  });
});
