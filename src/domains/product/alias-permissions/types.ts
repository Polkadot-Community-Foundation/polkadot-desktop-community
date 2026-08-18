import { type PermissionStatus } from '../permissions/types';

// Alias decisions share the permission decision vocabulary (`ask`/`granted`/`denied`).
export type AliasPermissionStatus = PermissionStatus;

export type AliasPermission = {
  key: string;
  requesterProductId: string;
  requestedContextId: string;
  // A stored 'ask' entry mirrors device/remote permissions: it surfaces the product in the
  // permission list as "Ask (Default)" (e.g. after "Allow once") while the gate still prompts.
  status: AliasPermissionStatus;
};
