import { type AllocatableResource, type AllocationOutcome, type CodecType } from '@novasamatech/host-api';

import { type AllowanceResourceKind } from '@/domains/product';

type AllocatableResourceValue = CodecType<typeof AllocatableResource>;

// Only resource kinds with readable on-chain allowance state qualify for the pre-check;
// any other tag in the request (SmartContractAllowance, AutoSigning) forces the regular
// SSO flow for the whole request. Returns the unique kinds to check — an empty result
// means "skip the pre-check" (empty request or an unmappable tag).
export function mapResourcesToAllowanceKinds(resources: AllocatableResourceValue[]): AllowanceResourceKind[] {
  const kinds = new Set<AllowanceResourceKind>();
  for (const resource of resources) {
    if (resource.tag === 'BulletinAllowance') kinds.add('bulletin');
    else if (resource.tag === 'StatementStoreAllowance') kinds.add('statementStore');
    else return [];
  }

  return [...kinds];
}

export function buildAllocatedOutcomes(resources: AllocatableResourceValue[]): CodecType<typeof AllocationOutcome>[] {
  return resources.map(() => ({ tag: 'Allocated', value: undefined }));
}
