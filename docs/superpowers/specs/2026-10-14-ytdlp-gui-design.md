# Interface gráfica para o yt-dlp — Especificação de design

- **Data:** 2026-10-14
- **Status:** aguardando revisão
- **Nome do produto:** a definir (usar `ytdlp-gui` como nome de trabalho no código; o nome final é trocado em um único arquivo de configuração)
- **Mockup aprovado:** [`assets/mockup-v3.html`](assets/mockup-v3.html)

## 1. Objetivo e público

Aplicativo desktop multiplataforma (Windows, macOS, Linux) que oferece uma interface moderna para o [yt-dlp](https://github.com/yt-dlp/yt-dlp).

Ele atende a dois objetivos ao mesmo tempo:

1. **Projeto de portfólio** do autor (desenvolvedor frontend sênior). O código precisa ter boa arquitetura e testes, e o visual precisa ser caprichado.
2. **Ferramenta distribuída para a comunidade**, com instaladores, atualização automática e um repositório aberto que receba contribuições.

**Critérios de sucesso**

- Uma pessoa leiga cola um link e baixa vídeo ou áudio sem abrir as configurações.
- Uma pessoa avançada chega às funções do yt-dlp que importam (formatos, legendas, SponsorBlock, trechos, cookies) sem precisar do terminal.
- O visual não tem cara de "gerado por IA": é minimalista, segue a linguagem visual do YouTube e é polido nos detalhes.
- Os instaladores dos três sistemas são gerados automaticamente a cada release.

## 2. Escopo da v1

### 2.1 Tela Baixar (principal)

- **Campo de link no topo**, no lugar do campo de busca do YouTube. Ele aceita colar e, se houver um link de vídeo na área de transferência, sugere colar.
- **Reconhecimento automático do link** (ver 4.2):
  - **Vídeo único:** prévia com miniatura, título, canal, data e duração, e pílulas com a qualidade máxima, o áudio e o trecho selecionado.
  - **Playlist, canal ou álbum:** cabeçalho com nome, autor, quantidade de itens e duração total. A lista de itens traz miniatura, caixa de seleção e tamanho estimado, mais os atalhos "Todos", "Nenhum", "Intervalo…" e "Não baixados". Itens que já estão no histórico aparecem esmaecidos e desmarcados.
  - **Link ambíguo** (vídeo dentro de uma playlist, `watch?v=…&list=…`): um seletor "Só este vídeo / Playlist inteira (N)", que corresponde a `--no-playlist` e `--yes-playlist`.
  - **Vários links colados de uma vez:** cada link é analisado e vira um item na fila.
- **Painel de decisão, ao lado da prévia:**
  - **Baixar como:** Vídeo, Só áudio ou Avançado.
  - **Vídeo:** qualidade (Melhor/4K, 1080p, 720p, 480p, cada uma com o tamanho estimado) e contêiner (MP4, MKV, WebM).
  - **Só áudio:** formato (MP3, M4A, Opus, FLAC) e qualidade.
  - **Avançado:** tabela dos formatos reais (`formats` do probe), para escolher a faixa de vídeo e a de áudio separadamente.
  - **Opções em segundo plano**, numa lista com resumo do que está ativo:
    - legendas: idiomas, embutidas ou em arquivo separado, e se inclui as automáticas
    - remover patrocínios (SponsorBlock, com escolha das categorias)
    - embutir capa, metadados e capítulos
    - baixar só um trecho (início → fim)
  - **Rodapé do painel:** caminho final do arquivo, já resolvido pelo modelo de nome, e o botão **Baixar**.
- Nas playlists, as opções escolhidas valem para todos os itens selecionados.

### 2.2 Tela Fila

- Cada item tem um estado: na fila, ativo, concluído, erro ou cancelado.
- Itens ativos mostram progresso, velocidade, tempo restante e tamanho. A fase atual também aparece: baixando vídeo, baixando áudio, juntando ou pós-processando.
- Ações por item: cancelar, tentar de novo, abrir arquivo, abrir pasta e ver detalhes técnicos.
- O limite de downloads simultâneos é configurável. O padrão é 2.
- Um contador na barra superior, com o ícone de download, mostra os itens ativos.

### 2.3 Tela Histórico

- Lista dos downloads concluídos, com busca por título. As ações são abrir arquivo, abrir pasta, baixar de novo e remover do histórico (o arquivo continua no disco).
- O histórico é a base do "já baixado" nas playlists. A comparação é feita pelo `extractor_key` mais o `id` do vídeo.

### 2.4 Tela Configurações

- **Downloads:**
  - pasta padrão
  - modelo de nome (exemplos prontos mais campo livre, com prévia ao vivo)
  - downloads simultâneos
  - qualidade e modo padrão
- **Rede:** limite de velocidade (`-r`), proxy (`--proxy`) e número de tentativas (`--retries`).
- **Acesso:** cookies do navegador (`--cookies-from-browser`), com o Firefox recomendado e um aviso sobre o Chrome no Windows (ver 6).
- **Aparência:** tema claro, escuro ou do sistema, e idioma (PT-BR ou EN).
- **Motor:** versões do yt-dlp e do ffmpeg, botão "Atualizar agora" e canal do yt-dlp (estável ou nightly).
- **Sobre:** autor, links, licença e créditos ao yt-dlp e ao ffmpeg.

### 2.5 Primeira execução

Na primeira execução aparece uma tela curta, "Preparando o motor", que baixa o yt-dlp e, se ainda não houver um, o ffmpeg. A tela mostra o progresso. Sem internet, o app explica o problema e oferece "Tentar de novo".

### 2.6 Fora do escopo da v1

- agendamento de downloads
- extensão de navegador
- gravação de transmissões ao vivo
- login com usuário e senha (os cookies do navegador cobrem esse caso)
- idiomas além de PT-BR e EN (ficam para contribuição da comunidade)
- assinatura de código (ver 8.3)
- publicação em winget, Homebrew e Flathub

## 3. Direção visual

A linguagem visual vem do YouTube, levantada com o REA a partir do youtube.com. Nenhuma marca do YouTube é usada: nada de logo, símbolo de play, nome ou botão vermelho de play.

### 3.1 Tokens

| Token                                     | Escuro                  | Claro                 |
| ----------------------------------------- | ----------------------- | --------------------- |
| `--bg`                                    | `#0f0f0f`               | `#ffffff`             |
| `--raised` (painéis, item ativo do menu)  | `#212121`               | `#f2f2f2`             |
| `--hover`                                 | `#272727`               | `#f2f2f2`             |
| `--chip`                                  | `rgba(255,255,255,.10)` | `rgba(0,0,0,.05)`     |
| `--line`                                  | `rgba(255,255,255,.10)` | `rgba(0,0,0,.10)`     |
| `--field` / `--field-line`                | `#121212` / `#303030`   | `#ffffff` / `#d3d3d3` |
| `--text-1`                                | `#f1f1f1`               | `#0f0f0f`             |
| `--text-2`                                | `#aaaaaa`               | `#606060`             |
| `--accent` (interruptores, links)         | `#3ea6ff`               | `#065fd4`             |
| `--signal` (barra de progresso, contador) | `#ff0033`               | `#ff0033`             |
| `--success`                               | `#2ba640`               | `#2ba640`             |

- **Tipografia:** Roboto 400, 500 e 700, com Roboto Mono para caminhos e versões. As fontes vêm empacotadas no app, sem depender da internet.
- **Raios:**
  - campo de link: 40px, em pílula
  - itens do menu e chips: 8 a 10px
  - miniaturas: 12px nas grandes e 8px nas da lista
  - painéis: 12px
  - botão principal: pílula
- **Botão principal:** pílula com fundo `--text-1` e texto `--bg`, ou seja, branco no tema escuro e preto no claro.
- **Chips:** fundo `--chip`. Quando selecionados, fundo `--text-1` e texto invertido.
- **Ícones:** [Lucide](https://lucide.dev) (ISC), traço 1,75, tamanhos de 16 a 20px. Todo ícone passa pelo componente `<Icon>`, para que trocar de biblioteca exija mexer num único arquivo.
- **Layout:** barra superior de 56px (menu, nome, campo de link centralizado com no máximo 640px, ações à direita), menu lateral de 240px recolhível e área de conteúdo.
- **Movimento:** transições curtas de 120 a 200ms, só em mudanças de estado (hover, seleção, abrir painel), respeitando `prefers-reduced-motion`.

### 3.2 Hierarquia das funções

1. **Primeiro plano:** o que se decide em todo download (link, modo, qualidade, Baixar). Sempre visível, com um clique.
2. **Segundo plano:** o que se decide às vezes (legendas, SponsorBlock, capa, trecho). Fica na lista de opções do painel, com resumo do que está ativo.
3. **Terceiro plano:** o que se configura uma vez (pasta, modelo de nome, cookies, proxy). Fica em Configurações. Quando algum desses ajustes está ativo, aparece no contexto: o menu lateral mostra em "Motor" o navegador dos cookies e o rodapé do painel mostra a pasta de destino.

### 3.3 Acessibilidade

- Navegação completa por teclado. O app abre com o foco no campo de link, e `Ctrl/Cmd+V` em qualquer tela cola e analisa.
- Contraste AA nos dois temas.
- Componentes interativos baseados no Radix UI, com ARIA correto.

## 4. Arquitetura

### 4.1 Camadas

```
┌────────────────────────── Interface (React 19 + TS + Vite) ──────────────────────────┐
│ telas: Baixar · Fila · Histórico · Configurações · Primeira execução                 │
│ estado: Zustand (queue, settings, history)   i18n: i18next   estilo: CSS Modules     │
│ componentes interativos: Radix UI   ícones: Lucide                                   │
├────────────────────────── Núcleo (src/core, TS puro, sem tela) ──────────────────────┤
│ buildArgs · parseProbe · parseProgress · mapError · resolveOutputPath · urlKind      │
├────────────────────────── Ponte (src/bridge) ────────────────────────────────────────┤
│ wrappers tipados de invoke()/listen() do Tauri — único ponto que conhece o Tauri     │
├────────────────────────── Rust (src-tauri, ~300 linhas) ─────────────────────────────┤
│ process: spawn/kill de árvore, stream de linhas como eventos                         │
│ deps: download + verificação SHA-256 de yt-dlp/ffmpeg, detecção de ffmpeg do sistema │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Regra de dependência:** a Interface depende do Núcleo e da Ponte. O Núcleo não depende de ninguém. A Ponte é o único lugar que importa `@tauri-apps/api`. Com isso dá para testar a interface com a Ponte simulada.

### 4.2 Núcleo: contratos

```ts
type MediaKind = 'video' | 'playlist' | 'ambiguous';

type Probe =
  | { kind: 'video'; video: VideoInfo }
  | { kind: 'playlist'; playlist: PlaylistInfo }
  | { kind: 'ambiguous'; videoUrl: string; playlistUrl: string; playlistCount: number };

interface DownloadOptions {
  mode: 'video' | 'audio' | 'advanced';
  video?: { maxHeight: number | 'best'; container: 'mp4' | 'mkv' | 'webm' };
  audio?: { format: 'mp3' | 'm4a' | 'opus' | 'flac'; quality: 0 | 2 | 5 };
  advanced?: { videoFormatId: string | null; audioFormatId: string | null };
  subtitles?: { langs: string[]; embed: boolean; includeAuto: boolean };
  sponsorBlock?: { action: 'remove' | 'mark'; categories: string[] };
  embedThumbnail: boolean;
  embedMetadata: boolean;
  embedChapters: boolean;
  section?: { start: string; end: string };
  playlistItems?: string;          // ex.: "1-3,7,10-12"
}

buildArgs(url: string, opts: DownloadOptions, settings: Settings): string[];
parseProbe(json: unknown, inputUrl: string): Probe;
parseProgress(line: string): ProgressEvent | null;
mapError(stderr: string): FriendlyError;   // { code, title, message, action? }
resolveOutputPath(template: string, info: VideoInfo, settings: Settings): string;
urlKind(url: string): 'single' | 'playlist' | 'ambiguous' | 'unknown'; // heurística antes do probe
```

Como `buildArgs` monta os argumentos, por modo:

- **Vídeo:** `-f "bv*[height<=H]+ba/b[height<=H]"`, `--merge-output-format <container>` e `-S` com preferência por codecs compatíveis com o contêiner.
- **Áudio:** `-x --audio-format <fmt> --audio-quality <q>`.
- **Avançado:** `-f "<v>+<a>"`, ou só um dos dois.
- **Opções:**
  - `--write-subs [--write-auto-subs] --sub-langs <langs> [--embed-subs]`
  - `--sponsorblock-remove|--sponsorblock-mark <cats>`
  - `--embed-thumbnail --embed-metadata --embed-chapters`
  - `--download-sections "*start-end"`
  - `-I <playlistItems>`
- **Sempre presentes:**
  - `--newline --no-colors`
  - `--progress-template "download:[ytdlp-gui]%(progress)j"`
  - `--print after_move:"[ytdlp-gui-file]%(filepath)s"`
  - `--ffmpeg-location <caminho>`
  - `-P <pasta>` e `-o <modelo>`
  - as opções de rede e cookies das configurações

**Probe** (dois passos, para responder rápido):

1. `yt-dlp -J --flat-playlist <url>`. Se `_type === 'playlist'`, o app mostra a playlist. Se `urlKind` indicar um link ambíguo, mostra o seletor.
2. Para vídeo único, ou quando o usuário escolhe "Só este vídeo": `yt-dlp -J --no-playlist <url>`, que traz formatos, legendas e capítulos.

### 4.3 Rust: comandos e eventos

| Comando             | Entrada            | Efeito                                                                                                    |
| ------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `run_ytdlp`         | `jobId`, `args[]`  | Inicia o processo e emite `job://line {jobId, stream, line}` e `job://exit {jobId, code}`                 |
| `run_ytdlp_capture` | `args[]`           | Executa e devolve `{code, stdout, stderr}` (usado pelo probe)                                             |
| `cancel_job`        | `jobId`            | Encerra a árvore de processos (no Windows com Job Object, no Unix por grupo de processos)                 |
| `deps_status`       | —                  | Versões e caminhos do yt-dlp e do ffmpeg, e se o ffmpeg é do sistema ou do app                            |
| `deps_install`      | `which`, `channel` | Baixa, confere o SHA-256, grava em `$APPDATA/bin`, aplica permissão de execução e emite `deps://progress` |
| `deps_update_ytdlp` | `channel`          | `yt-dlp --update-to <channel>`                                                                            |

**Fontes dos binários**

- **yt-dlp:** releases do GitHub do `yt-dlp/yt-dlp`, conferidas com o arquivo `SHA2-256SUMS`. Os arquivos são `yt-dlp.exe`, `yt-dlp_macos` e `yt-dlp_linux` (ou `yt-dlp_linux_aarch64`).
- **ffmpeg:** antes de baixar, o app procura um ffmpeg no `PATH`.
  - Windows e Linux: builds estáticos de `yt-dlp/FFmpeg-Builds`, conferidos pelo checksum publicado.
  - macOS: builds estáticos de `ffmpeg.martin-riedl.de`, um por arquitetura (arm64 ou x86_64, escolhido em tempo de execução), conferidos pelo SHA-256 publicado.
  - As URLs e os checksums ficam num manifesto versionado no repositório, `src-tauri/deps.json`.

### 4.4 Fila

- Fica no store do Zustand e é a fonte da verdade sobre o estado dos jobs. O agendador inicia jobs até atingir o limite de downloads simultâneos.
- Cada `job://line` passa por `parseProgress`, que atualiza progresso, velocidade, tempo restante e fase. Linhas com `[ytdlp-gui-file]` gravam o caminho final.
- Com `job://exit` e código 0, o item fica concluído e vai para o histórico. Com outro código, `mapError` traduz as últimas 50 linhas do stderr.
- **Persistência:** o histórico e as configurações são salvos com o `tauri-plugin-store`. Itens que não terminaram não voltam ao reabrir o app, ficam como "interrompido" com a opção de tentar de novo.

## 5. Tratamento de erros

| Situação                                          | Onde aparece              | Ação oferecida                                                    |
| ------------------------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| URL inválida ou site não suportado                | abaixo do campo de link   | —                                                                 |
| Vídeo privado, removido ou com restrição de idade | abaixo do campo / no item | "Usar cookies do navegador"                                       |
| Bloqueio por região                               | item                      | "Configurar proxy"                                                |
| Erro do extrator (site mudou)                     | item                      | "Atualizar yt-dlp"                                                |
| HTTP 429 / limite de requisições                  | item                      | "Tentar de novo mais tarde", com sugestão de limite de velocidade |
| ffmpeg ausente ou com falha                       | item                      | "Reinstalar ffmpeg"                                               |
| Falha ao ler cookies do Chrome (Windows)          | item / Configurações      | "Usar Firefox", com explicação                                    |
| Disco cheio ou sem permissão de escrita           | item                      | "Escolher outra pasta"                                            |
| Sem internet na primeira execução                 | tela de preparação        | "Tentar de novo"                                                  |

- Todo erro tem um link "Ver detalhes técnicos" com o comando executado (cookies e proxy mascarados), o stderr completo e um botão "Copiar para relatar problema".
- Erros que o `mapError` não reconhece aparecem como "Erro inesperado", com a última linha do stderr e os detalhes técnicos.

## 6. Pontos de atenção conhecidos

- **Cookies do Chrome no Windows:** a criptografia vinculada ao app, adotada em 2024, pode impedir a leitura. O app recomenda o Firefox e detecta essa falha para mostrar uma mensagem específica.
- **WebKitGTK no Linux:** a renderização pode diferir em detalhes. A CI gera os builds dos três sistemas, e o checklist de release inclui uma verificação visual em cada um.
- **O yt-dlp muda com frequência:** as fixtures de teste são saídas reais e devem ser atualizadas quando o formato da saída mudar. O manifesto `deps.json` não fixa a versão do yt-dlp, só a do ffmpeg.

## 7. Testes

- **Núcleo, com Vitest:**
  - cobertura de pelo menos 90% em `src/core`
  - fixtures em `src/core/__fixtures__/`, com saídas reais do yt-dlp:
    - probe de vídeo, de playlist e de canal
    - link ambíguo
    - linhas de progresso de vídeo e de áudio
    - stderr de cada erro da tabela da seção 5
  - testes de `buildArgs` por modo e combinação de opções, com snapshot dos argumentos
- **Interface, com Vitest e Testing Library:**
  - colar link → prévia de vídeo
  - colar link → playlist → seleção → Baixar
  - link ambíguo → seletor
  - item com erro → ação sugerida
  - troca de tema
- **De ponta a ponta, com Playwright:** a interface rodando no Vite com a Ponte simulada (`@tauri-apps/api/mocks`), cobrindo os fluxos principais nos dois temas, incluindo comparação de screenshots.
- **Rust, com `cargo test`:** verificação de checksum (válido e inválido), cancelamento da árvore de processos e parse do manifesto.
- **CI, com GitHub Actions:** a cada push, lint (ESLint, Prettier, Clippy), typecheck, testes e build nos três sistemas.

## 8. Distribuição

### 8.1 Builds

O `tauri-action` gera os instaladores numa matriz com os três sistemas, disparado pela tag de release:

- **Windows:** instaladores `.msi` e `.exe`
- **macOS:** `.dmg` universal (arm64 e x64)
- **Linux:** `AppImage`, `.deb` e `.rpm`

### 8.2 Atualização do app

- `tauri-plugin-updater` com endpoint nas Releases do GitHub e atualizações assinadas com a chave do Tauri. A chave privada fica nos segredos do repositório.
- O app verifica se há atualização ao abrir e só instala com o consentimento do usuário.

### 8.3 Assinatura de código

A v1 sai sem assinatura. O README explica como liberar o app no Windows (SmartScreen: "Mais informações" → "Executar assim mesmo") e no macOS (Ajustes do Sistema → Privacidade e Segurança → "Abrir mesmo assim"). Depois:

- **Windows:** pedir o SignPath, gratuito para projetos open source.
- **macOS:** avaliar a conta Apple Developer quando houver demanda.

### 8.4 Repositório

- Licença MIT.
- README com GIF de demonstração, capturas nos dois temas, instalação por sistema, recursos e créditos.
- `CONTRIBUTING.md`, guia de tradução (`src/i18n/locales/*.json`) e templates de issue e PR.
- Aviso de uso responsável: o usuário é responsável por respeitar direitos autorais e os termos de cada site.
- Commits padronizados (Conventional Commits) e `release-please` para versão e changelog.

## 9. Estrutura de pastas

```
ytdlp-gui/
├─ src/
│  ├─ app/            # shell, rotas, provedores (tema, i18n)
│  ├─ screens/        # Download/, Queue/, History/, Settings/, Onboarding/
│  ├─ components/     # UI reutilizável (Chip, Switch, Icon, Thumbnail, UrlField…)
│  ├─ core/           # funções puras + __fixtures__ + testes
│  ├─ bridge/         # wrappers tipados do Tauri + mock para testes
│  ├─ stores/         # queue.ts, settings.ts, history.ts
│  ├─ styles/         # tokens.css (temas), global.css, fontes
│  └─ i18n/           # configuração + locales/pt-BR.json, en.json
├─ src-tauri/
│  ├─ src/            # main.rs, process.rs, deps.rs
│  ├─ deps.json       # manifesto de binários
│  └─ tauri.conf.json
├─ e2e/               # Playwright
├─ docs/
└─ .github/workflows/ # ci.yml, release.yml
```

## 10. Decisões em aberto

- **Nome do produto e identidade:** nome, ícone do app e marca, sem nenhuma referência visual à marca do YouTube. Não bloqueia a implementação, porque o nome fica centralizado em `tauri.conf.json` e `src/app/brand.ts`.
