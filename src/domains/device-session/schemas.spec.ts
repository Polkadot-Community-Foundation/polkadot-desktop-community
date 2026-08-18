import { describe, expect, it } from 'vitest';

import { SignalingStatementData } from './schemas';

describe('SignalingStatementData', () => {
  it('round-trips a Request', () => {
    const decoded = SignalingStatementData.dec(
      SignalingStatementData.enc({
        tag: 'Request',
        value: { requestId: 'req-1', messages: [new Uint8Array([1, 2, 3]), new Uint8Array([4])] },
      }),
    );
    expect(decoded.tag).toBe('Request');
    if (decoded.tag !== 'Request') throw new Error('unreachable');
    expect(decoded.value.requestId).toBe('req-1');
    expect(decoded.value.messages.map(m => Array.from(m))).toEqual([[1, 2, 3], [4]]);
  });

  it('round-trips a Response', () => {
    const decoded = SignalingStatementData.dec(
      SignalingStatementData.enc({ tag: 'Response', value: { requestId: 'req-2', responseCode: 0 } }),
    );
    expect(decoded.tag).toBe('Response');
    if (decoded.tag !== 'Response') throw new Error('unreachable');
    expect(decoded.value.requestId).toBe('req-2');
    expect(decoded.value.responseCode).toBe(0);
  });

  // WIRE CONTRACT — the SCALE Enum discriminant is the variant index. These
  // bytes MUST match Android's `StructuredStatementData` @EnumIndex(0)/(1) and
  // chat's `StructuredStatementData` codec, or a device signals a peer it can't
  // decode. Do not reorder the variants in schemas.ts.
  it('encodes Request under discriminant 0x00 and Response under 0x01', () => {
    const request = SignalingStatementData.enc({ tag: 'Request', value: { requestId: '', messages: [] } });
    const response = SignalingStatementData.enc({ tag: 'Response', value: { requestId: '', responseCode: 0 } });
    expect(request[0]).toBe(0x00);
    expect(response[0]).toBe(0x01);
  });
});
