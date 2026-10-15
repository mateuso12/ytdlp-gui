# Code signing

Releases are currently **not** code-signed (see the README). Two different keys are involved; do not mix them up.

## Updater signature (already in use)

The in-app updater verifies every update against the public key in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The private key and its password are repository secrets named `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. They never go in the repository. To rotate: run `pnpm tauri signer generate`, store the new private key and password as secrets, and replace the public key. Installed apps can only update to builds signed with the key they already trust, so rotating the key requires a manual reinstall.

## Windows code signing with SignPath (optional, off by default)

Without a certificate, Windows SmartScreen warns on first run and Smart App Control blocks the app entirely. The [SignPath Foundation](https://signpath.org/foundation) signs open-source projects for free.

1. Apply at <https://signpath.org/foundation> with the public repository and the MIT license.
2. When approved, create the project and a signing policy in SignPath and note the organization ID, project slug and signing policy slug.
3. In the GitHub repository settings add:
   - variables: `SIGNPATH_ENABLED` = `true`, `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`
   - secret: `SIGNPATH_API_TOKEN`
4. The Windows job in `.github/workflows/release.yml` then uploads the installers to SignPath and downloads the signed copies (`signed-windows` artifact).

The step does not run unless `SIGNPATH_ENABLED` is `true`, so builds never depend on it. Note that `tauri-action` publishes the unsigned installers to the release first; once SignPath is approved, the workflow needs a follow-up step that replaces those release assets with the signed ones (and regenerates the updater signature for them). Adjust the SignPath artifact configuration to your project's needs.

## macOS

Signing and notarisation need an Apple Developer account. It will be evaluated if there is demand.

## Workflow hardening

Third-party actions are pinned by major version tag. Pinning to a full commit SHA is a possible further hardening.
