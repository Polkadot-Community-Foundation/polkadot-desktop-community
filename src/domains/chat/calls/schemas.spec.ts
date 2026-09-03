import { describe, expect, it } from 'vitest';

import { parseMainToWindow, parseWindowToMain } from './schemas';

const bytes = (n: number) => new Uint8Array([n]);

describe('parseWindowToMain', () => {
  it('accepts a valid publishOffer', () => {
    const msg = { kind: 'publishOffer', offerId: 'o1', purpose: 'video', sdp: bytes(1) };
    expect(parseWindowToMain(msg)).toEqual(msg);
  });
  it('accepts publishAnswer / publishCandidates / publishClosed', () => {
    expect(parseWindowToMain({ kind: 'publishAnswer', offerId: 'o1', sdp: bytes(2) })).not.toBeNull();
    expect(parseWindowToMain({ kind: 'publishCandidates', offerId: 'o1', candidates: bytes(3) })).not.toBeNull();
    expect(parseWindowToMain({ kind: 'publishClosed', offerId: 'o1' })).not.toBeNull();
  });
  it('rejects unknown kind', () => {
    expect(parseWindowToMain({ kind: 'nope', offerId: 'o1' })).toBeNull();
  });
  it('rejects a wrong-shaped payload (missing sdp, bad purpose, non-bytes)', () => {
    expect(parseWindowToMain({ kind: 'publishOffer', offerId: 'o1', purpose: 'video' })).toBeNull();
    expect(parseWindowToMain({ kind: 'publishOffer', offerId: 'o1', purpose: 'hologram', sdp: bytes(1) })).toBeNull();
    expect(parseWindowToMain({ kind: 'publishAnswer', offerId: 'o1', sdp: [1, 2, 3] })).toBeNull();
    expect(parseWindowToMain({ kind: 'publishOffer', offerId: 42, purpose: 'video', sdp: bytes(1) })).toBeNull();
  });
  it('rejects non-objects', () => {
    expect(parseWindowToMain(null)).toBeNull();
    expect(parseWindowToMain('x')).toBeNull();
    expect(parseWindowToMain(undefined)).toBeNull();
  });
  it('does NOT accept a MainToWindow message', () => {
    expect(parseWindowToMain({ kind: 'deliverAnswer', offerId: 'o1', sdp: bytes(1) })).toBeNull();
  });
});

describe('parseMainToWindow', () => {
  it('accepts a valid provideIncomingCall', () => {
    const msg = {
      kind: 'provideIncomingCall',
      offerId: 'o1',
      purpose: 'audio',
      sdp: bytes(1),
      candidates: bytes(2),
      peerName: 'mysticRiver.88',
    };
    expect(parseMainToWindow(msg)).toEqual(msg);
  });
  it('accepts deliverAnswer / deliverCandidates / deliverClosed', () => {
    expect(parseMainToWindow({ kind: 'deliverAnswer', offerId: 'o1', sdp: bytes(1) })).not.toBeNull();
    expect(parseMainToWindow({ kind: 'deliverCandidates', offerId: 'o1', candidates: bytes(1) })).not.toBeNull();
    expect(parseMainToWindow({ kind: 'deliverClosed', offerId: 'o1' })).not.toBeNull();
  });
  it('rejects wrong shape and unknown kind', () => {
    expect(parseMainToWindow({ kind: 'provideIncomingCall', offerId: 'o1', purpose: 'audio', sdp: bytes(1) })).toBeNull();
    expect(parseMainToWindow({ kind: 'publishOffer', offerId: 'o1', purpose: 'audio', sdp: bytes(1) })).toBeNull();
    expect(parseMainToWindow(null)).toBeNull();
  });
});
