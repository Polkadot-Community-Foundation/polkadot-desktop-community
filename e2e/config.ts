/**
 * E2E test configuration.
 * Single source of truth for environment-specific values.
 * Override via environment variables in CI or locally.
 *
 * Note: `botUsername` is computed per Playwright project via `makeBotUsername`
 * (see `e2e/helpers/bot-user.ts`) and injected through each project's `use:`
 * block in `playwright.config.ts`. Steps / fixtures must read it from there,
 * not from this file.
 */
export const e2eConfig = {
  /**
   * Base URL of the signing-bot service, supplied by `BOT_URL`. Required by the auth /
   * authenticated / chat / product-sdk projects; smoke, security and link-navigation run without it.
   */
  botUrl: process.env['BOT_URL'] || '',
  /**
   * Overrides the dotNS suffix for every environment, e.g. `E2E_DOTNS_TLD=.paseo`.
   * Unset means each environment uses its known suffix (`helpers/dotns.ts`) — set
   * it when a deployment changes its TLD before that map catches up.
   */
  dotNsTld: process.env['E2E_DOTNS_TLD'],
} as const;
