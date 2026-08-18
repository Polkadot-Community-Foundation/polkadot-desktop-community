import { firstValueFrom } from 'rxjs';

import { requestExternalUrlAccess } from '../permissions/broker';
import { type PermissionModality } from '../permissions/constants';
import { productPermissionsResource } from '../permissions/resource';
import { permissionsService } from '../permissions/service';
import { type PermissionStatus } from '../permissions/types';

// Whether an external-URL request that matches no stored permission prompts the user.
// Injected once at bootstrap (see permissions/bootstrap.ts) so the domain stays
// unaware of test environments. Defaults to closed until bootstrap runs.
let promptWhenUnmatched = false;

function setRemoteAccessPromptPolicy(enabled: boolean): void {
  promptWhenUnmatched = enabled;
}

/**
 * Single enforcement chokepoint for "may this product reach this external URL?".
 * Honors a decided stored pattern; otherwise prompts (policy on) or denies (policy off).
 * Used by the permission IPC handler, the worker fetch resolver, and the navigateTo binding.
 */
async function resolveRemoteUrlAccess({
  productId,
  url,
  modality,
}: {
  productId: string;
  url: string;
  modality: PermissionModality;
}): Promise<PermissionStatus> {
  const permissions = await firstValueFrom(productPermissionsResource.read$({ productId }));
  const stored = permissionsService.getRemotePermissionRequestStatus(permissions, { tag: 'Remote', value: [url] }, modality);

  // A stored (or rolled-up) 'ask' is "undecided" — fall through to the prompt path.
  if (stored && stored !== 'ask') return stored;
  if (!promptWhenUnmatched) return 'denied';

  return requestExternalUrlAccess({ productId, url, modality });
}

export const remoteAccessUseCase = { resolveRemoteUrlAccess, setRemoteAccessPromptPolicy };
