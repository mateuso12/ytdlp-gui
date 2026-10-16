<p align="center">
  <img src="docs/assets/logo.svg" alt="ytdlp-gui logo" width="96" height="96" />
</p>

<h1 align="center">ytdlp-gui</h1>

[English](README.md)

Uma interface de desktop simples e amigável para o [yt-dlp](https://github.com/yt-dlp/yt-dlp). Cole um link, escolha a qualidade e baixe. Feito com Tauri 2, React e TypeScript.


| Claro                                                                | Escuro                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ![Tela de download, tema claro](docs/screenshots/download-light.png) | ![Tela de download, tema escuro](docs/screenshots/download-dark.png) |
| ![Fila, tema claro](docs/screenshots/queue-light.png)                | ![Fila, tema escuro](docs/screenshots/queue-dark.png)                |

## Recursos

- Cole o link de um vídeo ou playlist e veja os detalhes antes de baixar.
- Escolha qualidade e formato com opções em linguagem simples; selecione os itens da playlist que quiser.
- Fila de downloads com progresso, cancelar e tentar de novo, mais um histórico dos downloads concluídos.
- Mensagens de erro amigáveis, com uma sugestão de solução (por exemplo, "usar cookies do Firefox").
- Instala o yt-dlp, o ffmpeg e o Deno na primeira execução (com verificação de checksum) e mantém o yt-dlp atualizado.
- Temas claro e escuro; português do Brasil e inglês.
- Atualizações dentro do app, assinadas com a chave do updater do Tauri. O app só instala uma atualização com o seu consentimento.

## Instalação

Baixe o instalador do seu sistema na [última versão](https://github.com/mateuso12/ytdlp-gui/releases/latest).

| Sistema                       | Arquivo                       |
| ----------------------------- | ----------------------------- |
| Windows                       | `.msi` ou `.exe`              |
| macOS (Apple silicon e Intel) | `.dmg`                        |
| Linux                         | `.AppImage`, `.deb` ou `.rpm` |

### O app ainda não tem assinatura de código

A versão 1 sai sem certificado de assinatura de código, então o sistema avisa na primeira vez que você abrir o app.

- **Windows (SmartScreen):** clique em **Mais informações** e depois em **Executar assim mesmo**.
- **macOS (Gatekeeper):** o app tem apenas assinatura ad-hoc, então o macOS pode se recusar a abri-lo. Tente **Ajustes do Sistema**, depois **Privacidade e Segurança**, e clique em **Abrir mesmo assim** ao lado do app bloqueado. Se não funcionar, o caminho mais confiável é remover a marca de quarentena no Terminal: `xattr -dr com.apple.quarantine /Applications/ytdlp-gui.app`.
- **Controle Inteligente de Aplicativos do Windows (Smart App Control):** se estiver ligado, o Windows bloqueia por completo os apps sem assinatura e não existe o botão "Executar assim mesmo". Você pode [compilar a partir do código-fonte](CONTRIBUTING.md#local-setup) ou esperar por uma versão assinada. A assinatura no Windows pelo SignPath Foundation está nos planos (veja [docs/signing.md](docs/signing.md)).

## Uso responsável

Você é responsável por respeitar os direitos autorais e os termos de uso de cada site de onde baixa. Use esta ferramenta apenas com conteúdo que você tem o direito de baixar.

## Créditos

Possível graças a software livre: [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense), [FFmpeg](https://github.com/FFmpeg/FFmpeg) (LGPL/GPL), [Deno](https://github.com/denoland/deno) (MIT), [Tauri](https://tauri.app) e [React](https://react.dev).

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) (em inglês) e [docs/translating.md](docs/translating.md).

## Licença

[MIT](LICENSE) © Mateus Amaro
