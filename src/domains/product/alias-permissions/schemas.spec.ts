import * as v from 'valibot';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { aliasPermissionSchema } from './schemas';
import { type AliasPermission } from './types';

describe('aliasPermissionSchema', () => {
  it('matches the domain type', () => {
    expectTypeOf<v.InferOutput<typeof aliasPermissionSchema>>().toEqualTypeOf<AliasPermission>();
  });
  it('parses a stored row', () => {
    const row = { key: 'k', requesterProductId: 'a', requestedContextId: 'b', status: 'granted' };
    expect(v.parse(aliasPermissionSchema, row).status).toBe('granted');
  });
  it('parses an "ask" row (allow-once persistence)', () => {
    const row = { key: 'k', requesterProductId: 'a', requestedContextId: 'b', status: 'ask' };
    expect(v.parse(aliasPermissionSchema, row).status).toBe('ask');
  });
});
