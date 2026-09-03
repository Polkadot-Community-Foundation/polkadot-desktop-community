// Product container — canonical entity, persistence, and the nested manifest
// sub-module (product manifest wire schemas + per-executable archive loader). Top-
// level product discovery lives in `$usecase/resolve.ts`, not here.
export type {
  AppExecutable,
  Executable,
  ExecutableContent,
  ExecutableKind,
  Icon,
  LiveExecutable,
  PersistedProduct,
  Product,
  ProductArchive,
  ProductExecutables,
  RootManifest,
  SemVer,
  WidgetExecutable,
  WorkerExecutable,
} from './product';
export type { ExecutableCacheStatus } from './product/executable-cache/types';
export {
  EXECUTABLE_KINDS,
  executableArchiveResource,
  manifestService,
  productDb,
  productService,
  productsResource,
  useDeclineUpdate,
  useDisplayedProduct,
  useExecutableArchive,
  useIsPinned,
  useIsProductInstalled,
  useLiveExecutable,
  usePersistedProductById,
  usePersistedProducts,
  useProductIcon,
} from './product';

// Host-environment wiring — call once from the app bootstrap (never at import time).
export { bootstrapProduct } from './bootstrap';

// Use cases — imperative product flows (multi-step writes / cross-module read
// composition). Each group is exported separately per project structure.
export { lifecycleUseCase } from './$usecase/lifecycle';
export { offlineCacheUseCase } from './$usecase/offlineCache';
// DEBT: on the public surface for `widgets/ProductContainerBinding/integrations/localStorage.ts`.
// Fix: a use case owning the read/write, with the widget calling that.
// eslint-disable-next-line local-rules/enforce-import-restrictions
export { productLocalStorageRepository } from './local-storage/repository';
export { remoteAccessUseCase } from './$usecase/remoteAccess';
export { resolveProductUseCase } from './$usecase/resolve';
export { useCommitProductByIdentifier, usePinExecutable, usePinProduct, useUnpinProduct } from './$usecase/commitment.hooks';
export { useInteractedProducts } from './$usecase/interaction.hooks';
export { useOfflineCacheSize, useOfflineCacheStatus } from './product/executable-cache/hooks';
export { commitmentUseCase } from './$usecase/commitment';
export { onProductModalityOpenedSideEffect, updatesUseCase } from './$usecase/updates';
export { allowanceUseCase } from './$usecase/allowance';
export { productAccountUseCase } from './$usecase/account';
export { useProductAccountAddress, useProductAccountAddresses } from './$usecase/account.hooks';
export type { AllowanceResourceKind } from './allowance/types';

export type { AppListing } from '@parity/browse-sdk';
export { browseService } from './browse/service';
export { usePublishedAppListings, usePublishedWidgetListings } from './browse/hooks';

export { dotNsService } from './dotns/service';
export { isLocalhostUrl, normalizeLocalhostUrl } from './dotns/service';
export { DEFAULT_DOTNS_TLD } from './dotns/constants';
export { useDotNsLabels, useDotNsTld, useIsProductIdentifier } from './dotns/hooks';
export { dotNsUseCase } from './$usecase/dotns';
export type { DotNsUrl } from './dotns/types';

export { productAccountService } from './account/service';

export { aliasPermissionService } from './alias-permissions/service';
export { useAllAliasPermissions, useRemoveAliasPermission, useSetAliasPermission } from './alias-permissions/hooks';
export type { AliasPermission, AliasPermissionStatus } from './alias-permissions/types';

export type { Binding, FetchResolver, ProductWorkerInstance, Sandbox, WorkerDeps, WorkerEvents } from './worker/types';
export { createProductWorker } from './worker/instance';
export { defaultWorkerBindings } from './worker/bindings';

export type {
  AggregatedPermission,
  AppPermissionEntry,
  DevicePermissionType,
  Permission,
  PermissionStatus,
  ProductPermissions,
  RemotePermissionIpcRequest,
  RemotePermissionRequest,
} from './permissions/types';
export { type PermissionId, type PermissionModality, PERMISSION_IDS } from './permissions/constants';
export {
  useAggregatedPermission,
  useAggregatedPermissions,
  useAllProductPermissions,
  useProductExternalRequestPatterns,
  useProductPermissions,
  useResetPermissionToDefault,
  useSetDevicePermission,
  useSetRemotePermission,
  useSetRemotePermissionsBatch,
} from './permissions/hooks';
export {
  clearTransientDevicePermissionGrants,
  grantTransientDevicePermission,
  resetPermissionToDefault,
  setDevicePermission,
  setRemotePermission,
  setRemotePermissionsBatch,
} from './permissions/resource';
export { permissionsService } from './permissions/service';
export type { DevicePermissionId } from './permissions/types';
export { _resetRemotePermissionBroker, pendingRemotePermissionRequests$, requestExternalUrlAccess } from './permissions/broker';
export type { PendingRemotePermissionRequest } from './permissions/broker';

// Recently opened products — persisted visit history, read back on every boot.
export { MAX_RECENT_PRODUCTS } from './recents/constants';
export { clearRecentProducts, forgetRecentProduct, recordRecentProduct, restoreRecentProducts } from './recents/resource';
export { useRecentProductIds } from './recents/hooks';
