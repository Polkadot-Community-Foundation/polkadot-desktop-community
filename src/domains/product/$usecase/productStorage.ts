import { type Observable } from 'rxjs';

import { productLocalStorageRepository } from '../local-storage/repository';

// The domain's public surface for a product's own key/value storage. The sandbox
// hands over an opaque key and blob; nothing here interprets either.
//
// Thin by design, and for the same reason as `coreStorage.ts`: `repository.ts` may
// not sit on the domain barrel (`local-rules/enforce-import-restrictions`), and the
// storage has no cache or identity to justify a resource, so a use case owning the
// read/write is how host-side callback code reaches it.

function readEntry(productId: string, key: string): Promise<Uint8Array | undefined> {
  return productLocalStorageRepository.readEntry(productId, key);
}

function writeEntry(productId: string, key: string, value: Uint8Array): Promise<void> {
  return productLocalStorageRepository.writeEntry(productId, key, value);
}

function clearEntry(productId: string, key: string): Promise<void> {
  return productLocalStorageRepository.clearEntry(productId, key);
}

function watchEntry(productId: string, key: string): Observable<Uint8Array | undefined> {
  return productLocalStorageRepository.watchEntry(productId, key);
}

export const productStorageUseCase = {
  readEntry,
  writeEntry,
  clearEntry,
  watchEntry,
};
