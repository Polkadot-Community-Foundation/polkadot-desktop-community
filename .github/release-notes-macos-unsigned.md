## Installing on macOS

This build is **not signed or notarized by Apple**, so Gatekeeper will block it on first launch ("Polkadot Desktop Dev is damaged / cannot be opened because Apple cannot check it"). To open it:

1. Open the `.dmg` and drag **Polkadot Desktop Dev** into your **Applications** folder.
2. In **Applications**, **right-click** (or Control-click) the app icon and choose **Open**.
3. In the dialog that appears, click **Open** again to confirm.

If macOS still refuses (common on macOS Sequoia / 15+):

- Try to open the app once (double-click) so it gets blocked.
- Go to **System Settings → Privacy & Security**, scroll to the **Security** section, and click **Open Anyway** next to the Polkadot Desktop Dev message. Confirm with **Open**.

Last resort — if it reports the app is "damaged", clear the quarantine attribute in Terminal:

```sh
xattr -cr "/Applications/Polkadot Desktop Dev.app"
```

Verify your download against `SHA256SUMS.txt` before running.

---
