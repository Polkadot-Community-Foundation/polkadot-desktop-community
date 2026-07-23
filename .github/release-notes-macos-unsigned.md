### macOS — unsigned build

These macOS builds are not yet signed/notarized by Apple, so Gatekeeper shows
**"Apple could not verify … is free of malware."** After moving the app to
**Applications**, clear the quarantine flag once, then open it normally:

```sh
xattr -dr com.apple.quarantine "/Applications/Polkadot Desktop Dev.app"
```

Verify your download against `SHA256SUMS.txt` before running.

---
