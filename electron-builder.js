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
import signWindowsWithCloudKms from './scripts/sign-windows-kms.js';

// Packaging is the moment an identity starts to mean something to an operating system, so it is
// also the moment a missing one has to stop the build.
assertPackagingIdentity();

// config/index.js treats anything but `production` as develop, so reject a misspelt BUILD_TYPE.
const buildType = (process.env.BUILD_TYPE ?? '').trim();
if (buildType !== '' && buildType !== 'dev' && buildType !== 'production') {
  throw new Error(`Unrecognised BUILD_TYPE "${buildType}". Expected "production", "dev", or unset (which means dev).`);
}

// Production ships the unlabelled black tile and every other build the white DEV tile, chosen by
// the same flag as the bundle id. The dev icon is already rounded, so macOS needs no separate art.
const icons = isProductionRelease
  ? { linux: 'icon.png', mac: 'icon-mac.png', win: 'icon.ico' }
  : { linux: 'icon.dev.png', mac: 'icon.dev.png', win: 'icon.dev.ico' };

// electron-builder falls back to the stock Electron icon when a path is missing, so fail instead.
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
    // Signs only when a Cloud KMS key ring is supplied. sha256 only: Windows rejects sha1 signatures.
    signtoolOptions: process.env.WINDOWS_CODESIGN_KEYSTORE
      ? { sign: signWindowsWithCloudKms, signingHashAlgorithms: ['sha256'] }
      : undefined,
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
