# Changelog

## [0.2.0](https://github.com/mateuso12/ytdlp-gui/compare/v0.1.0...v0.2.0) (2026-10-16)


### Features

* **brand:** logo, app icons and social preview ([#8](https://github.com/mateuso12/ytdlp-gui/issues/8)) ([7db15dd](https://github.com/mateuso12/ytdlp-gui/commit/7db15dd1701815c009f5b15752963f3d40dbf63b))

## 0.1.0 (2026-10-15)


### Features

* **about:** show the author and the real repository URL in Settings ([c23d14f](https://github.com/mateuso12/ytdlp-gui/commit/c23d14fdb29dd1d3c1694408e275678f51471e35))
* **bridge:** typed tauri bridge and mock ([3bc70a8](https://github.com/mateuso12/ytdlp-gui/commit/3bc70a8e15e1e8a15c29e02ca772e85c0143f854))
* **core:** buildArgs and buildProbeArgs ([ce61e13](https://github.com/mateuso12/ytdlp-gui/commit/ce61e13f3b7163815416606a80bbc2c8ee0fd282))
* **core:** domain types, urlKind and splitUrls ([c93d07c](https://github.com/mateuso12/ytdlp-gui/commit/c93d07c78ef59d13507fae2dcc57add05d7657af))
* **core:** map yt-dlp errors to friendly errors ([4538be7](https://github.com/mateuso12/ytdlp-gui/commit/4538be7a3c8909b872c8a4f12957e7b1d5468028))
* **core:** output template preview ([21eb90f](https://github.com/mateuso12/ytdlp-gui/commit/21eb90f720d162f593b26001fb5317f91edd95e4))
* **core:** parse yt-dlp progress lines ([ad63796](https://github.com/mateuso12/ytdlp-gui/commit/ad6379636e6304785f721d1ad1d37db765c2deb3))
* **core:** real yt-dlp fixtures and parseProbe ([9842e9c](https://github.com/mateuso12/ytdlp-gui/commit/9842e9c795f6aeb92dcb7541f4a0126e1b1e002b))
* **download:** playlist selection view ([a7d55df](https://github.com/mateuso12/ytdlp-gui/commit/a7d55df9836580059e36a272d676df8f53a0c535))
* **download:** url field and auto-detect probe flow ([ebad03a](https://github.com/mateuso12/ytdlp-gui/commit/ebad03af226919fe121da7864f0ecfabc4ded7ea))
* **download:** video preview and decision panel ([14f58bd](https://github.com/mateuso12/ytdlp-gui/commit/14f58bdb0583dd890135252d588fcbd761edf3bd))
* **errors:** map the YouTube bot check and HTTP 403; neutral unknown-error copy ([9b94e7d](https://github.com/mateuso12/ytdlp-gui/commit/9b94e7dbdaa31b775ee186186ddc6cf4615e4f8b))
* **history:** history screen ([7e54569](https://github.com/mateuso12/ytdlp-gui/commit/7e54569fc7ffe7a608a7b402c06ddf6d2076f6aa))
* **history:** remember download options and title placeholder-titled links from the file name ([5fc04c9](https://github.com/mateuso12/ytdlp-gui/commit/5fc04c975d39c2f876db53769eac0bb982a51788))
* **onboarding:** first-run engine setup and app update banner ([9fb9e58](https://github.com/mateuso12/ytdlp-gui/commit/9fb9e5802974aeede63bc6b16c036759fe6b8821))
* **playlist:** keep the shared options as playlist state and show a summary chip ([2b70620](https://github.com/mateuso12/ytdlp-gui/commit/2b70620e8dc8f219573be4dfa8af479a828809ac))
* **privacy:** mask the home folder in the shown and copied error report ([b8ef217](https://github.com/mateuso12/ytdlp-gui/commit/b8ef2170f4058521b3a9559d93e3fb21963b21b8))
* **queue:** queue screen, error details and top bar badge ([1fe0491](https://github.com/mateuso12/ytdlp-gui/commit/1fe04917c29c2ba5e0447c3e94de8f8cd256c830))
* **rust:** process spawn, stream and tree kill ([16b2dd5](https://github.com/mateuso12/ytdlp-gui/commit/16b2dd5a79e1f09107a96b4a904228c5bf50041f))
* **rust:** runtime dependency manager with checksum verification ([46f7d5a](https://github.com/mateuso12/ytdlp-gui/commit/46f7d5aa72b9476f5c4ea5ab8327c27dc8eb5a73))
* **settings:** settings screen ([2b1a7d4](https://github.com/mateuso12/ytdlp-gui/commit/2b1a7d4ba2bca77c683a126f9a11cb3511ee0ec7))
* **stores:** settings, history and queue scheduler ([c9361d1](https://github.com/mateuso12/ytdlp-gui/commit/c9361d1ce5c24a8248b5b0aecd38f54b6ad5b53c))
* **topbar:** theme toggle cycling system, light and dark ([4fca200](https://github.com/mateuso12/ytdlp-gui/commit/4fca200987774711429dd91dd6d14ccc6347d368))
* **ui:** app shell, navigation and i18n ([cdb0e49](https://github.com/mateuso12/ytdlp-gui/commit/cdb0e4911e91933b440d99b81fc75ae899838aab))
* **ui:** design tokens, themes and base components ([134b693](https://github.com/mateuso12/ytdlp-gui/commit/134b693b3efa7c22aadffd26c7762d5a503ee48b))
* **updater:** updater public key and endpoint, real CSP, crate metadata ([2a9caf8](https://github.com/mateuso12/ytdlp-gui/commit/2a9caf8d39a75208b805b29e5efc2281ffc6622e))
* **update:** warn and require a second click when downloads are running ([e77a2b6](https://github.com/mateuso12/ytdlp-gui/commit/e77a2b6318a5551a372b0ad39a8fd1474ae8f169))


### Bug Fixes

* **a11y:** keep &lt;html lang&gt; in sync with the language setting ([4253a5d](https://github.com/mateuso12/ytdlp-gui/commit/4253a5dc4ef0bd1acf4476b990598ab517c4c016))
* **args:** force utf-8 output encoding; resolution-first quality selection ([5804926](https://github.com/mateuso12/ytdlp-gui/commit/5804926c6c018ab4e7a972974696b04f8a6d1b23))
* **compat:** drop regexp lookbehind (Safari &lt; 16.4) and target safari14 in the build ([5a33c24](https://github.com/mateuso12/ytdlp-gui/commit/5a33c24430f4a291c1d7ab30142fc2a9cf8090e0))
* **core:** map all postprocessor tags to postprocessing phase ([46620ba](https://github.com/mateuso12/ytdlp-gui/commit/46620ba399f1397e651c5eb061d7e8787aa013b2))
* **csp:** keep style-src unsafe-inline effective, log violations in dev ([b72137f](https://github.com/mateuso12/ytdlp-gui/commit/b72137f26c17c7b1946bbbc04ed97841e5d60537))
* **deps:** align [@tauri-apps](https://github.com/tauri-apps) plugin versions with the Rust crates ([7073ce1](https://github.com/mateuso12/ytdlp-gui/commit/7073ce1ec777e68c4ad051c5d9ce23b5f5e580c2))
* **download:** never ask yt-dlp to embed a cover into WebM ([8d4fa7f](https://github.com/mateuso12/ytdlp-gui/commit/8d4fa7fb711b8bc16f065727d1b9424a92fd9f59))
* **download:** show unavailable playlist items as "Video indisponivel" ([4584216](https://github.com/mateuso12/ytdlp-gui/commit/4584216bf2b4f14e83de9471e016dcf2836ad693))
* **onboarding:** show only a neutral checking line until the engine status is known ([c253152](https://github.com/mateuso12/ytdlp-gui/commit/c2531524a39de73bf4eba1445692fd4488b17588))
* **queue:** generic retry rebuilds the command after cookies/proxy/folder fixes ([9a6937f](https://github.com/mateuso12/ytdlp-gui/commit/9a6937fef656c158ee9ecaeb669df546bf9dcbcd))
* **queue:** rebuild the command when a fix changes it ([a4345e6](https://github.com/mateuso12/ytdlp-gui/commit/a4345e65a1e4d22b830fb6c49da1192dbf43455e))
* robust home-folder masking, StrictMode-safe option notifications, neutral unknown copy, validated history opts ([703d822](https://github.com/mateuso12/ytdlp-gui/commit/703d822d8de9edaf573f7c3dc8cf0c1a7dc5a19a))
* **settings:** require a unit suffix on the rate limit ([e7dd1ca](https://github.com/mateuso12/ytdlp-gui/commit/e7dd1ca2ed5280277eaca88362ce4a43681c1772))
* **stores:** rebuild unbuilt jobs after restart and make startup resilient ([834bab4](https://github.com/mateuso12/ytdlp-gui/commit/834bab4473e057acb7dad69f917de80d912a9157))


### Performance Improvements

* **deps:** reuse the cached engine status for probes and enqueues ([64e1dd4](https://github.com/mateuso12/ytdlp-gui/commit/64e1dd43261c9fc83391ae8aacf9bd305a945db9))
