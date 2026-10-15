# Contributing

Thanks for helping out. Issues and pull requests are welcome in English or Portuguese.

## Local setup

You need Node.js 22, [pnpm](https://pnpm.io) (the version is pinned in `package.json`), a stable Rust toolchain and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your system (on Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev`, `libxdo-dev`).

```sh
pnpm install
pnpm tauri dev      # the desktop app
pnpm dev            # the UI alone in a browser (no Tauri APIs)
pnpm tauri build    # a release build with installers (see the note below)
```

`tauri.conf.json` turns on `bundle.createUpdaterArtifacts`, so a plain `pnpm tauri build` stops at the end asking for the updater signing key (`TAURI_SIGNING_PRIVATE_KEY`, which only the release workflow has). For a local build without it, turn the updater artifacts off for that run. The Tauri CLI has no flag for this, so use a config override:

```sh
pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

On Windows PowerShell, write the JSON with doubled quotes inside single quotes: `'{""bundle"":{""createUpdaterArtifacts"":false}}'`, or pass the path of a small JSON file with the same content.

## Running the tests

```sh
pnpm test                 # unit and component tests (Vitest)
pnpm lint
pnpm typecheck
pnpm e2e                  # Playwright behaviour flows (the "flows" project)
pnpm e2e:all              # flows plus the visual screenshots
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test
```

CI runs lint, typecheck, unit tests with coverage, clippy, `cargo test` and a debug build on Windows, macOS and Linux, and the e2e flows on Linux.

The visual screenshot baselines (`pnpm e2e:visual`, `pnpm e2e:update`) are platform-specific because fonts render differently on each system. They run on the developer's machine, not in CI.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with an optional scope, for example `fix(queue): keep the order after a retry`. `release-please` reads them to pick the next version and write the changelog.

## Teaching the app a new error

yt-dlp errors become friendly messages in `src/core/mapError.ts`. The `RULES` table is ordered and the first match wins.

1. Capture the real stderr and save it as `src/core/__fixtures__/stderr-<name>.txt`.
2. Add a `{ test: /regex/i, code, action? }` entry in the right place (specific rules before generic ones). If it needs a new `ErrorCode`, add it to `src/core/types.ts`.
3. Add the case to the table in `src/core/mapError.test.ts`.
4. Add `errors.<code>.title` and `errors.<code>.message` to **both** `src/i18n/locales/en.json` and `pt-BR.json`.

## Content Security Policy

The CSP lives in `src-tauri/tauri.conf.json`: `csp` for release builds and `devCsp` for `tauri dev`. Production is strict (no `unsafe-eval`; scripts are `'self'` only, and the built `index.html` has just one external module script). `devCsp` adds `'unsafe-inline'` scripts (Vite's react-refresh preamble) and `ws://`/`http://localhost:1420` (HMR).

Caveat: Tauri injects nonces/hashes into `script-src` and `style-src` of bundled assets, and a browser ignores `'unsafe-inline'` in a directive that has a nonce. Runtime-inserted `<style>` elements (Radix dialogs, for example) would then be blocked, so `dangerousDisableAssetCspModification` is set to `["style-src"]`. Scripts keep the nonce/hash protection.

In development, blocked requests are logged to the console as `CSP blocked <uri> (<directive>)`.

## Translations

See [docs/translating.md](docs/translating.md).

## Pull requests

Keep them focused, make sure the checks above pass, and fill in the template.
