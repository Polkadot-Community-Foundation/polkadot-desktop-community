// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllOutboxRecords } from './repository';

// Nothing writes outbox records any more — the statement store holds the unacknowledged
// batch and the session restores it at init. The purge is all that remains, so records
// left behind by older builds do not linger in localStorage.
describe('legacy outbox record purge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes only outbox keys', () => {
    localStorage.setItem('p2p-chat-outbox:v1:user-a:peer-1', '{}');
    localStorage.setItem('p2p-chat-outbox:v1:user-b:peer-2', '{}');
    localStorage.setItem('unrelated-key', 'keep me');

    clearAllOutboxRecords();

    expect(localStorage.getItem('p2p-chat-outbox:v1:user-a:peer-1')).toBeNull();
    expect(localStorage.getItem('p2p-chat-outbox:v1:user-b:peer-2')).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep me');
  });
});
