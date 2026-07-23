#!/usr/bin/env sh
# Import the Apple Developer ID Application certificate into a throwaway keychain on the
# macOS runner so electron-builder can code-sign (and then notarize) the .app/.dmg.
# Runs only on the signed path (HAS_APPLE == 'true'); the keychain dies with the runner.
set -eu

KEY_CHAIN=build.keychain
KEY_CHAIN_PWD=actions
CERTIFICATE_P12=certificate.p12

# Recreate the .p12 from the base64 secret (printf, not echo, to avoid mangling).
printf '%s' "$CERTIFICATE_OSX_APPLICATION" | base64 --decode > "$CERTIFICATE_P12"

# Create + unlock a dedicated keychain and make it the default so codesign finds the id.
security create-keychain -p "$KEY_CHAIN_PWD" "$KEY_CHAIN"
security default-keychain -s "$KEY_CHAIN"
security unlock-keychain -p "$KEY_CHAIN_PWD" "$KEY_CHAIN"

# Keep it unlocked long enough to sign AND notarize (6h) so it cannot re-lock mid-build.
security set-keychain-settings -lut 21600 "$KEY_CHAIN"

# Import the signing identity and authorize codesign to use it non-interactively.
security import "$CERTIFICATE_P12" -k "$KEY_CHAIN" -P "$CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEY_CHAIN_PWD" "$KEY_CHAIN"

# Ensure the keychain is on the search list (default-keychain alone isn't always enough).
security list-keychains -d user -s "$KEY_CHAIN" login.keychain

# Remove the decoded certificate from disk.
rm -f ./*.p12
