import { resolve } from 'node:path';

import packageJson from '../package.json' with { type: 'json' };

const { author: AUTHOR, description: DESCRIPTION, name: NAME, version: VERSION } = packageJson;

export const name = NAME;
export const author = AUTHOR;
export const version = VERSION;
export const description = DESCRIPTION;
export const electronProtocol = 'polkadot';

// Packaging channel. NODE_ENV stays `production` for any packaged build; the channel is
// selected independently via BUILD_CHANNEL so the public DEV distribution (Paseo testnet
// + foundation Firebase web app) installs side-by-side with the prod/summit build. The
// legacy NODE_ENV=staging path keeps its own `.stage` identity unchanged.
const isStaging = process.env.NODE_ENV === 'staging';
// Exported so electron-builder can pick the matching app icon: identity and icon
// have to agree, or the side-by-side DEV install is indistinguishable from prod.
export const isDevChannel = process.env.BUILD_CHANNEL === 'dev';

export const title = isStaging
  ? 'Polkadot Desktop Stage'
  : isDevChannel
    ? 'Polkadot Desktop Dev'
    : 'Polkadot Desktop';
export const appId = isStaging
  ? 'com.polkadot.desktop.stage'
  : isDevChannel
    ? 'com.polkadot.desktop.dev'
    : 'com.polkadot.desktop';

export const main = {
  window: {
    width: 800,
    defaultWidth: 1372,
    height: 800,
    defaultHeight: 800,
  },
};

const rendererUrl = new URL('https://localhost:4000');

export const renderer = {
  server: {
    origin: rendererUrl.origin,
    protocol: rendererUrl.protocol,
    host: rendererUrl.hostname,
    port: parseInt(rendererUrl.port),
  },
};

// Base URL for auto-updater feed. The runtime appends a channel suffix
// (`stable/` or `latest/` for experimental) before passing it to electron-updater.
export const updateServerUrl = process.env.AUTO_UPDATE_URL;

export const folders = {
  entrypoint: {
    main: resolve('./main/index.ts'),
    preload: resolve('./main/preload.ts'),
    renderer: resolve('./src/index.html'),
  },

  root: resolve('./'),
  mainRoot: resolve('./main'),
  rendererRoot: resolve('./src'),
  resources: resolve('./main/resources'),
  docs: resolve('./docs'),

  devBuild: resolve('./release/build'),
  prodBuild: resolve('./release/dist'),
  storybookBuild: resolve('./release/storybook'),
  docsBuild: resolve('./release/docs'),

  coverage: resolve('./.coverage'),
  cache: resolve('./node_modules/.cache'),
  tmp: resolve('./node_modules/.tmp'),
};
