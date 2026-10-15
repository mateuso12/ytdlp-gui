# Contributing

Thanks for helping out. Issues and pull requests are welcome in English or Portuguese.

## Local setup

You need Node.js 22, [pnpm](https://pnpm.io) (the version is pinned in `package.json`), a stable Rust toolchain and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your system (on Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev`, `libxdo-dev`).

```sh
pnpm install
pnpm tauri dev      # the desktop app
pnpm dev            # the UI alone in a browser (no Tauri APIs)
pnpm tauri build    # a release build with installers
```

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

## Translations

See [docs/translating.md](docs/translating.md).

## Pull requests

Keep them focused, make sure the checks above pass, and fill in the template.
