import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { database } from '@/shared/database';

import { declinedUpdatesRepository } from './repository';

afterEach(async () => {
  await database.declinedUpdates.clear();
});

describe('declinedUpdatesRepository', () => {
  it('records a decline and reports it declined for the same version', async () => {
    await declinedUpdatesRepository.record({ baseName: 'app.dot', kind: 'app', contenthash: '0xaa', version: [1, 0, 0] });
    expect(await declinedUpdatesRepository.isDeclined('app.dot', 'app', '0xaa')).toBe(true);
  });

  it('does NOT report declined for a different (newer) contenthash', async () => {
    await declinedUpdatesRepository.record({ baseName: 'app.dot', kind: 'app', contenthash: '0xaa', version: [1, 0, 0] });
    expect(await declinedUpdatesRepository.isDeclined('app.dot', 'app', '0xbb')).toBe(false);
  });

  it('scopes declines per kind', async () => {
    await declinedUpdatesRepository.record({ baseName: 'app.dot', kind: 'app', contenthash: '0xaa', version: [1, 0, 0] });
    expect(await declinedUpdatesRepository.isDeclined('app.dot', 'widget', '0xaa')).toBe(false);
  });

  it('deletes all declines for a product', async () => {
    await declinedUpdatesRepository.record({ baseName: 'app.dot', kind: 'app', contenthash: '0xaa', version: [1, 0, 0] });
    await declinedUpdatesRepository.record({ baseName: 'app.dot', kind: 'widget', contenthash: '0xbb', version: [2, 0, 0] });
    await declinedUpdatesRepository.deleteByBaseName('app.dot');
    expect(await declinedUpdatesRepository.isDeclined('app.dot', 'app', '0xaa')).toBe(false);
    expect(await declinedUpdatesRepository.isDeclined('app.dot', 'widget', '0xbb')).toBe(false);
  });
});
