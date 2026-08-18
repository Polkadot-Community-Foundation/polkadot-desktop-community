import type * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { type dashboardCardPayloadSchema, parseDashboardCardPayload } from './schemas';
import { type DashboardCardPayload } from './types';

describe('dashboardCardPayloadSchema drift guard', () => {
  it('schema output is assignable to DashboardCardPayload at compile time', () => {
    type SchemaOutput = v.InferOutput<typeof dashboardCardPayloadSchema>;
    // Typed identity: if the schema output diverges from the domain payload union
    // (a folder member changing shape, or content no longer covering `{ kind }`),
    // `return value` fails to compile.
    const schemaOutputIsPayload = (value: SchemaOutput): DashboardCardPayload => value;
    expect(schemaOutputIsPayload).toBeTypeOf('function');
  });
});

describe('parseDashboardCardPayload', () => {
  it('accepts the folder kind', () => {
    expect(parseDashboardCardPayload({ kind: 'folder', items: ['chat'] })).toEqual({
      kind: 'folder',
      items: ['chat'],
    });
  });

  it('accepts opaque content payloads, preserving extra fields verbatim', () => {
    expect(parseDashboardCardPayload({ kind: 'native:chat' })).toEqual({ kind: 'native:chat' });
    expect(parseDashboardCardPayload({ kind: 'product:widget', productId: 'app.dot' })).toEqual({
      kind: 'product:widget',
      productId: 'app.dot',
    });
  });

  it('rejects payloads without a string kind', () => {
    expect(parseDashboardCardPayload({})).toBeNull();
    expect(parseDashboardCardPayload(null)).toBeNull();
    expect(parseDashboardCardPayload({ kind: 42 })).toBeNull();
  });
});
