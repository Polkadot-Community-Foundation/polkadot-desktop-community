import { describe, expect, it } from 'vitest';

import { coreSlotService } from './service';

describe('coreSlotService.describeSlot', () => {
  it('carries the tag of every slot', () => {
    expect(coreSlotService.describeSlot({ tag: 'AuthSession' })).toEqual({ slotTag: 'AuthSession' });
  });

  // Each of these declares a `productId` in the core's own `CoreStorageKey`, and the
  // removal sweep queries that column. A variant missing here is a slot that outlives
  // the product it belongs to for the life of the install.
  it.each([
    ['PermissionAuthorization', { productId: 'one.dot', request: { tag: 'Device', value: 'Camera' } }],
    ['AutoSigningKey', { productId: 'one.dot' }],
    ['ProductSubtree', { sessionId: 'session-1', productId: 'one.dot' }],
    ['ProductManifest', { productId: 'one.dot' }],
  ])('indexes a %s slot by its product', (tag, value) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the table erases the tag/value correlation the union encodes
    const descriptor = coreSlotService.describeSlot({ tag, value } as never);

    expect(descriptor.productId).toBe('one.dot');
    expect(descriptor.slotTag).toBe(tag);
  });

  // The sweep deletes by `productId`, so inventing one for a slot keyed by something
  // else would delete core state belonging to no product.
  it('leaves a slot keyed by something other than a product unindexed', () => {
    const descriptor = coreSlotService.describeSlot({ tag: 'AllowanceKeys', value: { sessionId: 'session-1' } });

    expect(descriptor.productId).toBeUndefined();
  });

  // Encoded with the core's codec rather than restated, and only this slot carries one.
  it('encodes the request of a permission slot, and only that slot', () => {
    const permission = coreSlotService.describeSlot({
      tag: 'PermissionAuthorization',
      value: { productId: 'one.dot', request: { tag: 'Device', value: 'Camera' } },
    });
    const autoSigning = coreSlotService.describeSlot({ tag: 'AutoSigningKey', value: { productId: 'one.dot' } });

    expect(permission.request).toBeInstanceOf(Uint8Array);
    expect(autoSigning.request).toBeUndefined();
  });
});
