export type AliasPermissionDecision = 'deny' | 'allow-once' | 'allow-always' | 'dismiss';
export type AliasPermissionEffect = 'reject' | 'persist-ask' | 'persist-granted' | 'persist-denied';

export function decideAliasPermissionEffect(decision: AliasPermissionDecision): AliasPermissionEffect {
  // "Allow once" persists an 'ask' entry (so the product appears in the permission list as
  // "Ask (Default)") and still serves the request this time — mirrors device/remote allow-once.
  if (decision === 'allow-once') return 'persist-ask';
  if (decision === 'allow-always') return 'persist-granted';
  if (decision === 'deny') return 'persist-denied';
  return 'reject';
}
