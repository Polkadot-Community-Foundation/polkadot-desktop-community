import { appId, author, electronProtocol, folders, isDevChannel, title, updateServerUrl } from './config/index.js';

const CURRENT_YEAR = new Date().getFullYear();

// The DEV distribution installs side-by-side with prod (own appId and title), so it
// needs its own dock/taskbar/installer icon or the two are indistinguishable once
// installed. White tile = test network, per the app icon design language.
const iconPng = `${folders.resources}/icons/${isDevChannel ? 'icon.dev.png' : 'icon.png'}`;
const iconIco = `${folders.resources}/icons/${isDevChannel ? 'icon.dev.ico' : 'icon.ico'}`;

/**
 * @type {import('electron-builder').Configuration}
 *
 * @see https://www.electron.build/configuration
 */
export default {
  appId: appId,
  productName: title,
  copyright: `Copyright © ${CURRENT_YEAR} — ${author.name}`,

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
    icon: iconPng,
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
    icon: iconPng,
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
    icon: iconIco,
    target: ['nsis'],
  },

  publish: updateServerUrl ? { provider: 'generic', url: updateServerUrl } : null,

  generateUpdatesFilesForAllChannels: false,
  detectUpdateChannel: false,

  compression: 'normal',
  artifactName: '${productName}-${version}-${arch}.${ext}',
};
