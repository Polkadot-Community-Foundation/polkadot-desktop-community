import { type AuthState, type RequiredHostCallbacks } from '@parity/truapi-host';

import { createChainCallbacks } from './chainCallbacks';
import { createChatCallbacks } from './chatCallbacks';
import { createProductOperationsCallbacks } from './operationCallbacks';
import { createPassiveCallbacks } from './passiveCallbacks';
import { createCoreStorageCallbacks, createProductStorageCallbacks } from './storageCallbacks';

import { router } from '@/router';

/**
 * The one part of the host surface that cannot be built without React: asking the
 * user. Everything else reads app state through its own non-React source.
 */
export type HostPrompts = Pick<RequiredHostCallbacks, 'permissions' | 'userConfirmation'>;

type Deps = {
  prompts: HostPrompts;
  onAuthState: (state: AuthState) => void;
};

// The core prefixes every product-storage key with the calling product before it
// reaches the host, so this scope only separates core-routed product storage from
// anything else sharing the table.
const HOST_PRODUCT_SCOPE = 'truapi';

/**
 * The complete host surface the core requires.
 *
 * A plain factory, not a hook. The core holds this object for the runtime's whole
 * lifetime, which is a poor fit for a component's: the hook version had to pin every
 * group with `useMemo(…, [])` and read its live values through refs, so React's
 * re-render model was being defeated by hand at five separate call sites. Reading
 * each source on demand — chains, environment, theme, the auth state — gets the same
 * stable object without that, and makes every group testable without a renderer.
 *
 * `prompts` is injected because it is the exception: it renders dialogs into the
 * tree, so only it stays bound to React.
 */
export function createHostCallbacks({ prompts, onAuthState }: Deps): RequiredHostCallbacks {
  return {
    ...createChainCallbacks(),
    ...createChatCallbacks(),
    ...createPassiveCallbacks(({ identifier, route }) => {
      void router.navigate({ to: '/product/$id/{-$route}', params: { id: identifier, route } });
    }),
    ...createCoreStorageCallbacks(),
    // `productStorage` is the odd one: it is per-product, while the core takes one
    // host surface for the whole runtime. The core namespaces product keys before
    // calling, so a host-level binding is correct — the product scope it would
    // otherwise add is already in the key.
    ...createProductStorageCallbacks(HOST_PRODUCT_SCOPE),
    ...createProductOperationsCallbacks(),
    ...prompts,
    auth: { authStateChanged: onAuthState },
  };
}
