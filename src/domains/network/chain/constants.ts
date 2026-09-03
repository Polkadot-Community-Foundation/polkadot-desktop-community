import * as v from 'valibot';

import { genesisHash } from './schemas';
import { type ChainOptions, type GenesisHash } from './types';

// Runtime source of truth for the `ChainOptions` union — used to filter the
// untyped chains_v2 `options` strings down to the values we model. `satisfies`
// keeps it in sync with the type (a typo or stray value fails to compile).
export const CHAIN_OPTIONS = [
  'testnet',
  'governance',
  'multisig',
  'regular_proxy',
  'pure_proxy',
  'ethereum_based',
] as const satisfies readonly ChainOptions[];

// Well-known public relay-chain genesis hashes — for chain-list sorting (group
// parachains under their relay) and light-client routing. NOT environment config.
export const WellKnownChains = {
  polkadotRelay: v.parse(genesisHash, '0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3'),
  kusamaRelay: v.parse(genesisHash, '0xb0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe'),
  westendRelay: v.parse(genesisHash, '0xe143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e'),
  // Verified live against wss://paseo-rpc.n.dwellir.com (specName `paseo`, spec 2003001).
  // Upstream still carries the pre-reset value 0x77afd619…, which that endpoint no longer
  // serves; restoring the fork's 940a150. Keep in sync with summit-net-deployments/DEVNET.md.
  paseoRelay: v.parse(genesisHash, '0x374057be67b355151f271ff70c3db98308c62c8adc48dc6724b6a009a1a014fd'),
} satisfies Record<string, GenesisHash>;
