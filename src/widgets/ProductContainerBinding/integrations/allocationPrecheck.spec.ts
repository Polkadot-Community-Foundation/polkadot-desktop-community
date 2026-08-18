import { type AllocatableResource, type CodecType } from '@novasamatech/host-api';
import { describe, expect, it } from 'vitest';

import { buildAllocatedOutcomes, mapResourcesToAllowanceKinds } from './allocationPrecheck';

type AllocatableResourceValue = CodecType<typeof AllocatableResource>;

function resource(tag: AllocatableResourceValue['tag']): AllocatableResourceValue {
  if (tag === 'SmartContractAllowance') return { tag, value: { tag: 'Index', value: 0 } };
  return { tag, value: undefined };
}

describe('mapResourcesToAllowanceKinds', () => {
  it('maps a repeated-kind request to the unique kind', () => {
    expect(mapResourcesToAllowanceKinds([resource('BulletinAllowance'), resource('BulletinAllowance')])).toEqual(['bulletin']);
  });

  it('maps an all-statement-store request', () => {
    expect(mapResourcesToAllowanceKinds([resource('StatementStoreAllowance')])).toEqual(['statementStore']);
  });

  it('maps a mixed mappable request', () => {
    expect(mapResourcesToAllowanceKinds([resource('BulletinAllowance'), resource('StatementStoreAllowance')])).toEqual([
      'bulletin',
      'statementStore',
    ]);
  });

  it('returns an empty list when any resource tag is unmappable, forcing the SSO path', () => {
    expect(mapResourcesToAllowanceKinds([resource('BulletinAllowance'), resource('SmartContractAllowance')])).toEqual([]);
    expect(mapResourcesToAllowanceKinds([resource('AutoSigning')])).toEqual([]);
  });

  it('returns an empty list for an empty request', () => {
    expect(mapResourcesToAllowanceKinds([])).toEqual([]);
  });
});

describe('buildAllocatedOutcomes', () => {
  it('builds one Allocated outcome per resource, matching length and order', () => {
    const resources = [resource('BulletinAllowance'), resource('StatementStoreAllowance'), resource('BulletinAllowance')];
    expect(buildAllocatedOutcomes(resources)).toEqual([
      { tag: 'Allocated', value: undefined },
      { tag: 'Allocated', value: undefined },
      { tag: 'Allocated', value: undefined },
    ]);
  });

  it('returns an empty array for an empty request', () => {
    expect(buildAllocatedOutcomes([])).toEqual([]);
  });
});
