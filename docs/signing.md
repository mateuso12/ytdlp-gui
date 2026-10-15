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
4. The Windows job in `.github/workflows/release.yml` then uploads the installers as a workflow artifact, submits them to SignPath and downloads the signed copies into a local directory (`signed-windows`) on the runner. That is all it does.

The step does not run unless `SIGNPATH_ENABLED` is `true`, so builds never depend on it. **Still to do** once SignPath is approved: `tauri-action` has already attached the unsigned installers to the draft release, so a follow-up step must replace those release assets with the signed ones (for example with `gh release upload --clobber`) and regenerate the updater `.sig` files and `latest.json` for them. The step has not been tested. Adjust the SignPath artifact configuration to your project's needs.

## macOS

Signing and notarisation need an Apple Developer account. It will be evaluated if there is demand.

## Workflow hardening

Third-party actions are pinned by major version tag. Dependabot (`.github/dependabot.yml`) proposes updates weekly for GitHub Actions, npm and Cargo. Once it is on, pinning the release job's actions to full commit SHAs is a recommended hardening (Dependabot keeps SHA pins current).

## Release process notes

- release-please creates the GitHub release as a **draft**. The `build` jobs attach the installers and `latest.json` to it, and the final `publish` job publishes it only if every build succeeded.
- The manifest starts at `0.0.0` and the config has `release-as: 0.1.0` so the first release is 0.1.0 whatever the commits say. **Remove `release-as` from `release-please-config.json` after the first release**, or it keeps forcing that version. Key names (`release-as`, `draft`) are from memory of the release-please docs; verify them on the first run.
