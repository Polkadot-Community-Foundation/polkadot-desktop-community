import { type CoreStorageKey, PermissionAuthorizationRequest } from '@parity/truapi-host';

import { type CoreSlotDescriptor } from './types';

/**
 * The key's own fields, kept alongside the encoded key so the host can enumerate the
 * slots it holds for a product and sweep them when that product is removed.
 *
 * `productId` is detected **structurally**, not from a list of tags. The core owns the
 * `CoreStorageKey` union and adds variants; a hand-listed set silently stops indexing
 * the day one arrives, and an unindexed slot is invisible to the sweep and outlives the
 * product forever. Matching on the field the sweep actually queries makes a new variant
 * carrying a product id work on arrival.
 *
 * Do not derive the set from the library's prose at `host-callbacks.d.ts:911-913` — it
 * lists three variants and omits `ProductManifest`. The type definitions are the
 * authority.
 */
function describeSlot(key: CoreStorageKey): CoreSlotDescriptor {
  const descriptor: CoreSlotDescriptor = { slotTag: key.tag };

  if (key.value && 'productId' in key.value) {
    descriptor.productId = key.value.productId;
  }

  // The only slot carrying a request. Encoded with the core's own codec, so nothing
  // here restates the request's shape.
  if (key.tag === 'PermissionAuthorization') {
    descriptor.request = PermissionAuthorizationRequest.enc(key.value.request);
  }

  return descriptor;
}

export const coreSlotService = { describeSlot };
