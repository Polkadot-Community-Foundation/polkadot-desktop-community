import { type Observable, map } from 'rxjs';

import { database, streamTable } from '@/shared/database';

// Per-product binary key/value storage for the product sandbox. The point reads and
// writes are imperative — the sandbox SDK reads/writes blobs on demand — so this is a
// plain repository surface, not a resource or use case. `watchEntry` is the one live
// read: the core subscribes to a key and the table's own writes are the change signal,
// the same liveQuery mechanism `coreStorageRepository` uses for its slot index.
async function readEntry(productId: string, key: string): Promise<Uint8Array | undefined> {
  const storage = await database.productLocalStorage.get(productId);
  return storage?.data[key];
}

async function writeEntry(productId: string, key: string, value: Uint8Array): Promise<void> {
  const existing = await database.productLocalStorage.get(productId);

  if (existing) {
    existing.data[key] = value;
    await database.productLocalStorage.put(existing);
  } else {
    await database.productLocalStorage.add({ productId, data: { [key]: value } });
  }
}

async function clearEntry(productId: string, key: string): Promise<void> {
  const existing = await database.productLocalStorage.get(productId);
  if (!existing) return;

  delete existing.data[key];
  await database.productLocalStorage.put(existing);
}

async function clearAllEntries(productId: string): Promise<void> {
  await database.productLocalStorage.delete(productId);
}

function watchEntry(productId: string, key: string): Observable<Uint8Array | undefined> {
  return streamTable(database.productLocalStorage, table => table.get(productId)).pipe(map(row => row?.data[key]));
}

export const productLocalStorageRepository = {
  readEntry,
  writeEntry,
  clearEntry,
  clearAllEntries,
  watchEntry,
};
