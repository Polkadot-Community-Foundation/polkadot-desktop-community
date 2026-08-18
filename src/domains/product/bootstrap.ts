import { firstValueFrom } from 'rxjs';

import { onUserLoggedOutSideEffect } from '@/domains/application';

import { productAccountUseCase } from './$usecase/account';
import { remoteAccessUseCase } from './$usecase/remoteAccess';
import { getTransientDevicePermissionGranted, productPermissionsResource } from './permissions/resource';
import { permissionsService } from './permissions/service';

type BootstrapProductConfig = {
  /**
   * Behaviour when an external-URL request matches no stored permission:
   * `true` → prompt the user; `false` → deny silently. Automated/e2e runs pass
   * `false` so probes observe a fast 403 and UI tests aren't blocked by an
   * unexpected modal. The flag is injected by the app bootstrap — the domain
   * holds no knowledge of test environments.
   */
  promptForUnmatchedRemoteAccess: boolean;
};

const readPermissionsOnce = (productId: string) => firstValueFrom(productPermissionsResource.read$({ productId }));

// Registers the renderer's product-permission IPC request handlers on the host and
// applies the remote-access prompt policy. Called explicitly from the app bootstrap
// (never at import time), so the domain owns no hidden load-order side effects. The
// IPC handlers are registered only where the host bridge exists; the prompt policy is
// applied unconditionally (web build, node-env tests included).
export function bootstrapPermissions({ promptForUnmatchedRemoteAccess }: BootstrapProductConfig): void {
  // Apply the renderer-side chokepoint policy before the host-bridge guard: the worker
  // fetch resolver and navigateTo binding run `resolveRemoteUrlAccess` even on the web
  // build (no `window.App`), so the policy must be set there too — otherwise unmatched
  // URLs default to a silent deny instead of prompting.
  remoteAccessUseCase.setRemoteAccessPromptPolicy(promptForUnmatchedRemoteAccess);

  if (typeof window === 'undefined' || !window.App) return;

  window.App.onDevicePermissionRequest(async ({ productId, permission, executable }) => {
    const modality = permissionsService.modalityForKind(executable);
    // A live "allow once" grant for this session opens the native gate without a
    // persisted 'granted'. Checked before the persisted lookup (and before any IO).
    if (getTransientDevicePermissionGranted({ productId, permission, modality })) {
      return 'granted';
    }
    const permissions = await readPermissionsOnce(productId);
    return permissionsService.getDevicePermissionStatus(permissions, permission, modality) ?? 'ask';
  });

  window.App.onRemotePermissionRequest(async ({ productId, executable, request }) => {
    if (request.tag !== 'Remote') return 'denied';

    const modality = permissionsService.modalityForKind(executable);
    return remoteAccessUseCase.resolveRemoteUrlAccess({ productId, url: request.url, modality });
  });
}

// Wires the product domain to the host environment (IPC request handlers, etc.).
// Composes the per-module bootstraps and is the domain's public entry point —
// call it once from the app bootstrap, never at module-import time, so host
// wiring and its load order stay explicit.
export function bootstrapProduct(config: BootstrapProductConfig): void {
  bootstrapPermissions(config);

  // Persisted subtree keys are per-user, so they die with the session. Registered as a
  // handler rather than called from `runV2Logout` directly: `application` may not import
  // `product` (that closes an import cycle), so the logout declares the seam and this
  // domain plugs into it. No `key` — `bootstrapProduct` runs exactly once.
  onUserLoggedOutSideEffect.registerHandler({
    available: () => true,
    body: () => productAccountUseCase.clearPersistedProductSubtrees(),
  });
}
