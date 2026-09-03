import { existsSync } from 'node:fs';

import {
  appId,
  assertPackagingIdentity,
  author,
  autoUpdateUrl,
  electronProtocol,
  folders,
  isProductionRelease,
  title,
  updateFeed,
} from './config/index.js';

// Packaging is the moment an identity starts to mean something to an operating system, so it is
// also the moment a missing one has to stop the build.
assertPackagingIdentity();

// `BUILD_TYPE` is a two-value switch — `.github/actions/build-app/action.yml` declares it as a
// `choice` of dev|production — but config/index.js reads it as "production, or else develop", so a
// misspelling resolves to a perfectly coherent develop build instead of failing. That is fine for
// an unset value, which is how a fork building with no repository variables at all arrives here,
// and not fine for a typo in a release pipeline that meant to say `production`.
const buildType = (process.env.BUILD_TYPE ?? '').trim();
if (buildType !== '' && buildType !== 'dev' && buildType !== 'production') {
  throw new Error(`Unrecognised BUILD_TYPE "${buildType}". Expected "production", "dev", or unset (which means dev).`);
}

// Which artwork the build ships, per the icon design language: the tile says which network — black
// for real Polkadot, white for a test network — and a three-letter label says which build channel,
// production being the only unlabelled one. The develop distribution installs beside production
// under its own bundle id and display name, so giving it the production icon leaves the two
// indistinguishable once installed; that is the question every devnet bug report has to answer
// first.
//
// Keyed off the same `isProductionRelease` that chooses the bundle id, so icon and identity cannot
// drift apart — and inheriting that flag's default is the point rather than an accident. BUILD_TYPE
// unset means develop, so an unconfigured build ships the white DEV tile. The failure worth
// engineering against is a build that quietly looks like the real Polkadot app; one that visibly
// looks like a test build announces its own mistake.
//
// macOS takes separate production art because upstream's `icon.png` is a hard square and macOS
// wants a rounded tile. It needs no separate develop art: the generated devnet icon already carries
// the design language's 22.5% corner radius, within two pixels of `icon-mac.png`'s own (first
// opaque pixel on the top row at x=223 vs x=221, both 1024px), so the one file serves both targets.
const icons = isProductionRelease
  ? { linux: 'icon.png', mac: 'icon-mac.png', win: 'icon.ico' }
  : { linux: 'icon.dev.png', mac: 'icon.dev.png', win: 'icon.dev.ico' };

// An icon path that does not resolve is not an error to electron-builder — it warns and falls back
// to the stock Electron artwork. A build that ships the wrong icon while reporting success is the
// whole failure mode above, so resolve every path through here and refuse to package without it.
const iconPath = target => {
  const path = `${folders.resources}/icons/${icons[target]}`;

  if (!existsSync(path)) {
    throw new Error(
      `Cannot package without the ${isProductionRelease ? 'production' : 'develop'} ${target} icon. Missing: ${path}.`,
    );
  }

  return path;
};

const CURRENT_YEAR = new Date().getFullYear();

/**
 * @type {import('electron-builder').Configuration}
 *
 * @see https://www.electron.build/configuration
 */
export default {
  appId: appId,
  productName: title,
  copyright: `Copyright © ${CURRENT_YEAR} — ${author}`,

  directories: {
    app: folders.devBuild,
    output: folders.prodBuild,
  },

  protocols: {
    name: title,
    schemes: [electronProtocol],
  },

  mac: {
    category: 'public.app-category.finance',
    hardenedRuntime: true,
    icon: iconPath('mac'),
    entitlements: `${folders.resources}/entitlements/entitlements.mac.plist`,
    entitlementsInherit: `${folders.resources}/entitlements/entitlements.mac.plist`,
    target: [
      {
        target: 'dmg',
        arch: ['arm64', 'x64'],
      },
      {
        target: 'zip',
        arch: ['arm64', 'x64'],
      },
    ],
    notarize: true,
  },

  linux: {
    icon: iconPath('linux'),
    category: 'Finance',
    target: ['AppImage'],
    mimeTypes: [`x-scheme-handler/${electronProtocol}`],
    desktop: {
      entry: {
        StartupWMClass: title,
      },
    },
  },

  win: {
    icon: iconPath('win'),
    target: ['nsis'],
  },

  publish: updateFeed,

  generateUpdatesFilesForAllChannels: false,
  detectUpdateChannel: false,

  compression: 'normal',
  // `${name}` (`polkadot-desktop`), not `${productName}` ("Polkadot Desktop"): a GitHub release
  // asset's name must not contain spaces. GitHub rewrites a space to `.`, while electron-updater
  // rewrites it to `-` when building the download URL from the metadata, so a spaced name is
  // uploaded and requested under two different filenames and every download 404s.
  //
  // A static feed has no such rewriting and its publishing steps address artifacts by the spaced
  // name, so that deployment keeps `${productName}` — changing it would rename every object in the
  // bucket for no benefit.
  artifactName: autoUpdateUrl ? '${productName}-${version}-${arch}.${ext}' : '${name}-${version}-${arch}.${ext}',
};
