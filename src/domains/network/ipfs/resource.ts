import { createQueryResource } from '@/shared/resource';

import { ipfsGateway } from './gateway';

// Cached raw IPFS gateway fetch, keyed by CID + form. `asCar` requests the
// resource as a CAR archive; the canonical/default form is whatever the gateway
// serves natively. Both forms are cached independently so consumers (icons,
// archives, generic blobs) share fetches by CID.
//
// `gatewayUrl` is a parameter, not something this resource resolves: the active
// environment comes from `environmentUseCase`, and a resource never calls a use
// case. Callers that already sit above it (hooks, use cases) pass it down.
// It is deliberately NOT part of the cache key — IPFS content is addressed by
// CID, so the same CID is the same bytes whichever gateway served it, and
// keying by CID alone keeps the cache warm across an environment switch.
export const ipfsRawResource = createQueryResource<{ cid: string; gatewayUrl: string; asCar?: boolean }>({
  key: ({ cid, asCar }) => (asCar ? `car:${cid}` : cid),
})
  .request<Uint8Array | null>(({ cid, gatewayUrl, asCar }) => ipfsGateway.fetchRaw(gatewayUrl, cid, { asCar }))
  .timeout(60_000)
  .cache<Record<string, Uint8Array>>({
    staleAfter: Number.POSITIVE_INFINITY,
    initial: {},
    map(cache, value, params) {
      if (!value) return cache;
      const key = params.asCar ? `car:${params.cid}` : params.cid;

      return { ...cache, [key]: value };
    },
  })
  .build();
