import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockBridge, type MockBridge } from '../../bridge/mock'
import type { DepsStatus } from '../../bridge/types'
import videoRaw from '../../core/__fixtures__/video.json?raw'
import { parseProbe } from '../../core/parseProbe'
import type { DownloadOptions, VideoInfo } from '../../core/types'
import i18n from '../../i18n'
import { useQueue } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { renderApp } from '../../test/renderApp'
import { DecisionPanel } from './DecisionPanel'
import { VideoPreview } from './VideoPreview'

const VIDEO_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
const FILENAME = 'C:\\Videos\\ytdlp-gui\\Big Buck Bunny [aqz-KE-bpKQ].mp4'

function baseVideo(): VideoInfo {
  const probe = parseProbe(JSON.parse(videoRaw), VIDEO_URL)
  if (probe.kind !== 'video') throw new Error('fixture is not a video')
  return probe.video
}

/** The fixture video, plus a file name (the fixture has none) and Portuguese/English subtitles. */
const VIDEO: VideoInfo = {
  ...baseVideo(),
  filename: FILENAME,
  subtitles: ['en', 'pt'],
  autoSubtitles: ['es', 'fr'],
}

type User = ReturnType<typeof userEvent.setup>

function setDefaults(defaults: Partial<DownloadOptions> = {}) {
  useSettings.setState((s) => ({
    settings: {
      ...s.settings,
      outputDir: 'C:\\Videos\\ytdlp-gui',
      defaults: {
        mode: 'video',
        video: { maxHeight: 1080, container: 'mp4' },
        audio: { format: 'mp3', quality: 0 },
        ...defaults,
      },
    },
  }))
}

function setup(props: { video?: VideoInfo; compact?: boolean } = {}) {
  const onDownload = vi.fn<(opts: DownloadOptions) => void>()
  const user = userEvent.setup()
  render(<DecisionPanel video={VIDEO} {...props} onDownload={onDownload} />)
  return { onDownload, user }
}

const panel = () => screen.getByRole('region', { name: 'Opções de download' })
const chip = (name: string | RegExp, pressed?: boolean) =>
  within(panel()).getByRole('button', { name, pressed })
const download = () => within(panel()).getByRole('button', { name: 'Baixar' })

/** Opens a popover row, clicks the given checkboxes, and closes it with Escape. */
async function pickInPopover(user: User, trigger: RegExp, labels: string[]) {
  await user.click(within(panel()).getByRole('button', { name: trigger }))
  const dialog = await screen.findByRole('dialog')
  for (const label of labels)
    await user.click(within(dialog).getByRole('checkbox', { name: label }))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

async function lastDownload(user: User, onDownload: ReturnType<typeof setup>['onDownload']) {
  await user.click(download())
  expect(onDownload).toHaveBeenCalledTimes(1)
  return onDownload.mock.calls[0][0]
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('pt-BR'))
  setDefaults()
})

describe('defaults', () => {
  it('starts with the defaults of the settings: Vídeo, 1080p and MP4', () => {
    setup()
    expect(chip('Vídeo', true)).toBeInTheDocument()
    expect(chip(/^1080p/, true)).toBeInTheDocument()
    expect(chip('MP4', true)).toBeInTheDocument()
    expect(chip('MKV', false)).toBeInTheDocument()
    expect(chip(/^720p/, false)).toBeInTheDocument()
  })

  it('follows other defaults: 720p and MKV', () => {
    setDefaults({ video: { maxHeight: 720, container: 'mkv' } })
    setup()
    expect(chip(/^720p/, true)).toBeInTheDocument()
    expect(chip('MKV', true)).toBeInTheDocument()
  })

  it('a default of "best" selects the tallest height, which stands for it', () => {
    setDefaults({ video: { maxHeight: 'best', container: 'mp4' } })
    setup()
    expect(chip(/^4K/, true)).toBeInTheDocument()
  })

  it('a default height the video does not have falls to the closest one below', () => {
    setDefaults({ video: { maxHeight: 900, container: 'mp4' } })
    setup()
    expect(chip(/^720p/, true)).toBeInTheDocument()
  })

  it('starts on audio when the default mode is audio', () => {
    setDefaults({ mode: 'audio', audio: { format: 'flac', quality: 0 } })
    setup()
    expect(chip('Só áudio', true)).toBeInTheDocument()
    expect(chip('FLAC', true)).toBeInTheDocument()
  })

  it('the quality chips carry the estimated size, in the language of the app', () => {
    setup()
    // 1080p: 257 619 653 B of video plus 10 271 496 B of audio.
    expect(chip(/^1080p/)).toHaveTextContent('~255 MB')
    expect(chip(/^4K/)).toHaveTextContent('~1,3 GB')
  })

  it('lists the sections in the order of the mockup', () => {
    setup()
    const text = panel().textContent ?? ''
    const order = ['Baixar como', 'Qualidade', 'Formato', 'Legendas', 'Remover patrocínios']
    const at = order.map((label) => text.indexOf(label))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
})

describe('mode', () => {
  it('"Só áudio" hides the quality and the video format and shows MP3, M4A, Opus and FLAC', async () => {
    const { user } = setup()
    await user.click(chip('Só áudio'))
    expect(chip('Só áudio', true)).toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: /^1080p/ })).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'MP4' })).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'MKV' })).not.toBeInTheDocument()
    expect(within(panel()).queryByText('Qualidade')).not.toBeInTheDocument()
    for (const name of ['MP3', 'M4A', 'Opus', 'FLAC']) {
      expect(chip(name)).toBeInTheDocument()
    }
    expect(chip('MP3', true)).toBeInTheDocument()
  })

  it('the audio quality is offered for lossy formats only', async () => {
    const { user } = setup()
    await user.click(chip('Só áudio'))
    expect(within(panel()).getByText('Qualidade do áudio')).toBeInTheDocument()
    await user.click(chip('FLAC'))
    expect(within(panel()).queryByText('Qualidade do áudio')).not.toBeInTheDocument()
  })

  it('downloads audio with the chosen format and quality', async () => {
    const { user, onDownload } = setup()
    await user.click(chip('Só áudio'))
    await user.click(chip('Opus'))
    await user.click(chip('Média'))
    const opts = await lastDownload(user, onDownload)
    expect(opts).toMatchObject({ mode: 'audio', audio: { format: 'opus', quality: 5 } })
    expect(opts.video).toBeUndefined()
  })

  it('switching back to Vídeo keeps the choices made there', async () => {
    const { user } = setup()
    await user.click(chip(/^720p/))
    await user.click(chip('Só áudio'))
    await user.click(chip('Vídeo'))
    expect(chip(/^720p/, true)).toBeInTheDocument()
  })
})

describe('Baixar', () => {
  it('hands over the chosen video options', async () => {
    const { user, onDownload } = setup()
    await user.click(chip(/^720p/))
    await user.click(chip('MKV'))
    const opts = await lastDownload(user, onDownload)
    expect(opts).toEqual({
      mode: 'video',
      video: { maxHeight: 720, container: 'mkv' },
      embedThumbnail: true,
      embedMetadata: true,
      embedChapters: true,
    })
  })

  it('sends "best" through when the video offers heights above the listed ones', async () => {
    const tall = {
      ...VIDEO,
      formats: [
        ...VIDEO.formats,
        { ...VIDEO.formats[VIDEO.formats.length - 1], id: '8k', height: 4320, filesize: 5e9 },
      ],
    }
    setDefaults({ video: { maxHeight: 'best', container: 'mp4' } })
    const { user, onDownload } = setup({ video: tall })
    expect(chip(/^Melhor/, true)).toBeInTheDocument()
    const opts = await lastDownload(user, onDownload)
    expect(opts.video).toEqual({ maxHeight: 'best', container: 'mp4' })
  })

  it('"Embutir capa e capítulos" off turns the three embeds off', async () => {
    const { user, onDownload } = setup()
    await user.click(within(panel()).getByRole('switch', { name: 'Embutir capa e capítulos' }))
    const opts = await lastDownload(user, onDownload)
    expect(opts).toMatchObject({
      embedThumbnail: false,
      embedMetadata: false,
      embedChapters: false,
    })
  })

  it('no subtitles, SponsorBlock or section unless asked for', async () => {
    const { user, onDownload } = setup()
    const opts = await lastDownload(user, onDownload)
    expect(opts.subtitles).toBeUndefined()
    expect(opts.sponsorBlock).toBeUndefined()
    expect(opts.section).toBeUndefined()
  })
})

describe('subtitles', () => {
  it('the summary reads "Português, Inglês" after choosing pt and en', async () => {
    const { user, onDownload } = setup()
    expect(within(panel()).getByRole('button', { name: /Legendas/ })).toHaveTextContent('Nenhuma')
    await pickInPopover(user, /Legendas/, ['Português', 'Inglês'])
    expect(within(panel()).getByRole('button', { name: /Legendas/ })).toHaveTextContent(
      'Português, Inglês',
    )
    const opts = await lastDownload(user, onDownload)
    expect(opts.subtitles).toEqual({ langs: ['pt', 'en'], embed: true, includeAuto: false })
  })

  it('unchecking a language takes it out of the summary', async () => {
    const { user } = setup()
    await pickInPopover(user, /Legendas/, ['Português', 'Inglês'])
    await pickInPopover(user, /Legendas/, ['Português'])
    const row = within(panel()).getByRole('button', { name: /Legendas/ })
    expect(row).toHaveTextContent('Inglês')
    expect(row).not.toHaveTextContent('Português')
  })

  it('offers a separate file instead of embedding', async () => {
    const { user, onDownload } = setup()
    await user.click(within(panel()).getByRole('button', { name: /Legendas/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inglês' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Arquivo separado' }))
    await user.keyboard('{Escape}')
    const opts = await lastDownload(user, onDownload)
    expect(opts.subtitles).toEqual({ langs: ['en'], embed: false, includeAuto: false })
  })

  it('automatic subtitles come in with their own switch', async () => {
    const { user, onDownload } = setup()
    await user.click(within(panel()).getByRole('button', { name: /Legendas/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('checkbox', { name: 'Espanhol' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('switch', { name: 'Incluir legendas automáticas' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Espanhol' }))
    await user.keyboard('{Escape}')
    const opts = await lastDownload(user, onDownload)
    expect(opts.subtitles).toEqual({ langs: ['es'], embed: true, includeAuto: true })
  })

  it('turning the automatic ones off drops the languages that only they had', async () => {
    const { user, onDownload } = setup()
    await user.click(within(panel()).getByRole('button', { name: /Legendas/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inglês' }))
    const auto = within(dialog).getByRole('switch', { name: 'Incluir legendas automáticas' })
    await user.click(auto)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Francês' }))
    await user.click(auto)
    await user.keyboard('{Escape}')
    const opts = await lastDownload(user, onDownload)
    expect(opts.subtitles).toEqual({ langs: ['en'], embed: true, includeAuto: false })
  })

  it('says so when the video has no subtitles at all', async () => {
    const { user } = setup({ video: { ...VIDEO, subtitles: [], autoSubtitles: [] } })
    await user.click(within(panel()).getByRole('button', { name: /Legendas/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Este vídeo não tem legendas.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('names the languages in the language of the app', async () => {
    await act(() => i18n.changeLanguage('en'))
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Subtitles/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('checkbox', { name: 'Portuguese' })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'English' })).toBeInTheDocument()
  })
})

describe('SponsorBlock', () => {
  const sponsorSwitch = () => within(panel()).getByRole('switch', { name: 'Remover patrocínios' })

  it('is off to begin with and offers no categories', () => {
    setup()
    expect(sponsorSwitch()).not.toBeChecked()
    expect(within(panel()).queryByRole('button', { name: /categorias/i })).not.toBeInTheDocument()
  })

  it('switching it on removes "sponsor" and "selfpromo"', async () => {
    const { user, onDownload } = setup()
    await user.click(sponsorSwitch())
    expect(within(panel()).getByRole('button', { name: /categorias/i })).toHaveTextContent(
      '2 categorias',
    )
    const opts = await lastDownload(user, onDownload)
    expect(opts.sponsorBlock).toEqual({ action: 'remove', categories: ['sponsor', 'selfpromo'] })
  })

  it('the popover picks the action and the categories', async () => {
    const { user, onDownload } = setup()
    await user.click(sponsorSwitch())
    await user.click(within(panel()).getByRole('button', { name: /categorias/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: 'Só marcar capítulos' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Introdução' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Autopromoção' }))
    await user.keyboard('{Escape}')
    expect(within(panel()).getByRole('switch', { name: 'Marcar patrocínios' })).toBeChecked()
    const opts = await lastDownload(user, onDownload)
    expect(opts.sponsorBlock).toEqual({ action: 'mark', categories: ['sponsor', 'intro'] })
  })

  it('with every category unchecked nothing is sent', async () => {
    const { user, onDownload } = setup()
    await user.click(sponsorSwitch())
    await pickInPopover(user, /categorias/i, ['Patrocínio', 'Autopromoção'])
    const opts = await lastDownload(user, onDownload)
    expect(opts.sponsorBlock).toBeUndefined()
  })
})

describe('section', () => {
  async function typeSection(user: User, start: string, end: string) {
    await user.click(within(panel()).getByRole('button', { name: /Baixar só um trecho/ }))
    const dialog = await screen.findByRole('dialog')
    if (start) await user.type(within(dialog).getByRole('textbox', { name: 'Início' }), start)
    if (end) await user.type(within(dialog).getByRole('textbox', { name: 'Fim' }), end)
    return dialog
  }

  it('accepts 3:15 → 7:40, shows it and sends it', async () => {
    const { user, onDownload } = setup()
    expect(within(panel()).getByRole('button', { name: /Baixar só um trecho/ })).toHaveTextContent(
      'Vídeo inteiro',
    )
    const dialog = await typeSection(user, '3:15', '7:40')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(within(panel()).getByRole('button', { name: /Baixar só um trecho/ })).toHaveTextContent(
      '3:15 → 7:40',
    )
    expect(download()).toBeEnabled()
    const opts = await lastDownload(user, onDownload)
    expect(opts.section).toEqual({ start: '3:15', end: '7:40' })
  })

  it.each([
    ['m:ss', '3:15', '7:40', { start: '3:15', end: '7:40' }],
    ['h:mm:ss', '0:01:30', '1:02:03', { start: '1:30', end: '1:02:03' }],
    ['seconds', '195', '460', { start: '3:15', end: '7:40' }],
  ])('accepts %s', async (_name, start, end, expected) => {
    const { user, onDownload } = setup()
    await typeSection(user, start, end)
    await user.keyboard('{Escape}')
    const opts = await lastDownload(user, onDownload)
    expect(opts.section).toEqual(expected)
  })

  it('an end at or before the start shows an inline error and disables Baixar', async () => {
    const { user, onDownload } = setup()
    const dialog = await typeSection(user, '7:40', '3:15')
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'O fim precisa ser depois do início.',
    )
    expect(within(dialog).getByRole('textbox', { name: 'Fim' })).toBeInvalid()
    expect(download()).toBeDisabled()
    await user.keyboard('{Escape}')
    // The reason stays visible after the popover closes.
    expect(within(panel()).getByRole('button', { name: /Baixar só um trecho/ })).toHaveTextContent(
      'Trecho inválido',
    )
    expect(download()).toBeDisabled()
    await user.click(download())
    expect(onDownload).not.toHaveBeenCalled()
  })

  it('text that is not a time is an error too', async () => {
    const { user } = setup()
    const dialog = await typeSection(user, 'abc', '')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Use m:ss, h:mm:ss ou segundos.')
    expect(download()).toBeDisabled()
  })

  it('fixing the times enables Baixar again', async () => {
    const { user } = setup()
    const dialog = await typeSection(user, '7:40', '3:15')
    expect(download()).toBeDisabled()
    await user.clear(within(dialog).getByRole('textbox', { name: 'Fim' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Fim' }), '9:00')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(download()).toBeEnabled()
  })

  it('"Limpar" empties both fields', async () => {
    const { user, onDownload } = setup()
    const dialog = await typeSection(user, '3:15', '7:40')
    await user.click(within(dialog).getByRole('button', { name: 'Limpar' }))
    expect(within(dialog).getByRole('textbox', { name: 'Início' })).toHaveValue('')
    await user.keyboard('{Escape}')
    const opts = await lastDownload(user, onDownload)
    expect(opts.section).toBeUndefined()
  })

  it('tells the outside which section is set', async () => {
    const onSectionChange = vi.fn()
    const user = userEvent.setup()
    render(<DecisionPanel video={VIDEO} onDownload={vi.fn()} onSectionChange={onSectionChange} />)
    await user.click(within(panel()).getByRole('button', { name: /Baixar só um trecho/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Início' }), '3:15')
    await user.type(within(dialog).getByRole('textbox', { name: 'Fim' }), '7:40')
    expect(onSectionChange).toHaveBeenLastCalledWith({ start: '3:15', end: '7:40' })
    await user.clear(within(dialog).getByRole('textbox', { name: 'Fim' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Fim' }), '1:00')
    expect(onSectionChange).toHaveBeenLastCalledWith(null)
  })
})

describe('keyboard', () => {
  it('a popover opens with Enter, closes with Escape and gives the focus back', async () => {
    const { user } = setup()
    const trigger = within(panel()).getByRole('button', { name: /Legendas/ })
    trigger.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('the options can be reached by Tab, in order, and the rows are real buttons', async () => {
    const { user } = setup()
    chip('Vídeo').focus()
    const seen: string[] = []
    for (let i = 0; i < 30; i++) {
      await user.tab()
      seen.push(
        document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent ??
          '',
      )
    }
    const joined = seen.join('|')
    expect(joined.indexOf('Legendas')).toBeGreaterThan(-1)
    expect(joined.indexOf('Legendas')).toBeLessThan(joined.indexOf('trecho'))
  })
})

describe('footer', () => {
  it('shows the file name from the probe', () => {
    setup()
    expect(within(panel()).getByText(FILENAME)).toBeInTheDocument()
  })

  it('follows the container and the audio format in the extension', async () => {
    const { user } = setup()
    await user.click(chip('MKV'))
    expect(within(panel()).getByText(FILENAME.replace('.mp4', '.mkv'))).toBeInTheDocument()
    await user.click(chip('Só áudio'))
    expect(within(panel()).getByText(FILENAME.replace('.mp4', '.mp3'))).toBeInTheDocument()
  })

  it('shows the destination folder when the probe gave no file name', () => {
    setup({ video: { ...VIDEO, filename: null } })
    expect(within(panel()).getByText('C:\\Videos\\ytdlp-gui')).toBeInTheDocument()
  })
})

describe('advanced', () => {
  async function openAdvanced(user: User) {
    await user.click(chip('Avançado'))
    return {
      video: screen.getByRole('table', { name: 'Faixas de vídeo' }),
      audio: screen.getByRole('table', { name: 'Faixas de áudio' }),
    }
  }

  it('lists the formats with resolution, fps, codec, bitrate and size', async () => {
    const { user } = setup()
    const { video, audio } = await openAdvanced(user)
    expect(within(panel()).queryByRole('button', { name: /^1080p/ })).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'MP4' })).not.toBeInTheDocument()

    const headers = (table: HTMLElement) =>
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    expect(headers(video)).toEqual(['Escolher', 'ID', 'Resolução', 'FPS', 'Codec', 'Tamanho'])
    expect(headers(audio)).toEqual(['Escolher', 'ID', 'Codec', 'Bitrate', 'Tamanho'])

    // 399: AV1, 1080p60, 124 386 876 B.
    const av1 = within(video).getByRole('radio', { name: /^399:/ }).closest('tr') as HTMLElement
    expect(within(av1).getByText('1080p')).toBeInTheDocument()
    expect(within(av1).getByText('60')).toBeInTheDocument()
    expect(within(av1).getByText('AV1')).toBeInTheDocument()
    expect(within(av1).getByText('119 MB')).toBeInTheDocument()

    // 251: Opus, 128.6 kbps, 10 202 210 B.
    const opus = within(audio).getByRole('radio', { name: /^251:/ }).closest('tr') as HTMLElement
    expect(within(opus).getByText('Opus')).toBeInTheDocument()
    expect(within(opus).getByText('129 kbps')).toBeInTheDocument()
    expect(within(opus).getByText('9,7 MB')).toBeInTheDocument()
  })

  it('starts with the best video and the best audio picked', async () => {
    const { user, onDownload } = setup()
    await openAdvanced(user)
    const opts = await lastDownload(user, onDownload)
    expect(opts.mode).toBe('advanced')
    expect(opts.advanced).toEqual({ videoFormatId: '315', audioFormatId: '140' })
  })

  it('picking a video track and an audio track fills "advanced"', async () => {
    const { user, onDownload } = setup()
    const { video, audio } = await openAdvanced(user)
    await user.click(within(video).getByRole('radio', { name: /^399:/ }))
    await user.click(within(audio).getByRole('radio', { name: /^251:/ }))
    expect(within(video).getByRole('radio', { name: /^399:/ })).toBeChecked()
    expect(within(video).getByRole('radio', { name: /^315:/ })).not.toBeChecked()
    const opts = await lastDownload(user, onDownload)
    expect(opts).toMatchObject({
      mode: 'advanced',
      advanced: { videoFormatId: '399', audioFormatId: '251' },
    })
    expect(opts.video).toBeUndefined()
  })

  it('a click on the row picks the track as well', async () => {
    const { user, onDownload } = setup()
    const { audio } = await openAdvanced(user)
    const row = within(audio).getByRole('radio', { name: /^251:/ }).closest('tr') as HTMLElement
    await user.click(within(row).getByText('Opus'))
    const opts = await lastDownload(user, onDownload)
    expect(opts.advanced?.audioFormatId).toBe('251')
  })

  it('compact mode has no Avançado', () => {
    setup({ compact: true })
    expect(within(panel()).queryByRole('button', { name: 'Avançado' })).not.toBeInTheDocument()
    expect(chip('Vídeo')).toBeInTheDocument()
    expect(chip('Só áudio')).toBeInTheDocument()
  })

  it('compact mode turns an "advanced" default into Vídeo', () => {
    setDefaults({ mode: 'advanced' })
    setup({ compact: true })
    expect(chip('Vídeo', true)).toBeInTheDocument()
  })
})

describe('compact and without a video', () => {
  it('compact hides the file name but keeps the destination folder and Baixar', () => {
    setup({ compact: true })
    expect(within(panel()).queryByText(FILENAME)).not.toBeInTheDocument()
    expect(within(panel()).getByText('C:\\Videos\\ytdlp-gui')).toBeInTheDocument()
    expect(download()).toBeEnabled()
  })

  it('without a video (a playlist) the usual heights are offered, without sizes', async () => {
    const { user, onDownload } = setup({ video: undefined, compact: true })
    for (const name of ['4K', '1440p', '1080p', '720p', '480p']) {
      expect(chip(new RegExp(`^${name}`))).toBeInTheDocument()
    }
    expect(chip(/^1080p/)).not.toHaveTextContent('~')
    expect(chip(/^1080p/, true)).toBeInTheDocument()
    const opts = await lastDownload(user, onDownload)
    expect(opts.video).toEqual({ maxHeight: 1080, container: 'mp4' })
  })

  it('without a video the subtitle row still offers none', () => {
    setup({ video: undefined, compact: true })
    expect(within(panel()).getByRole('button', { name: /Legendas/ })).toHaveTextContent('Nenhuma')
  })
})

describe('VideoPreview', () => {
  it('shows the thumbnail, duration, title, channel, date and the pills', () => {
    const { container } = render(
      <VideoPreview video={{ ...VIDEO, thumbnail: 'https://i.ytimg.com/a.jpg' }} />,
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://i.ytimg.com/a.jpg')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByText('10:35')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: VIDEO.title })).toBeInTheDocument()
    expect(screen.getByText('Blender')).toBeInTheDocument()
    expect(screen.getByText('Publicado em 10 de nov. de 2014')).toBeInTheDocument()
    expect(screen.getByText('2160p60')).toBeInTheDocument()
    expect(screen.getByText('AAC 129k')).toBeInTheDocument()
    expect(screen.queryByTestId('section-pill')).not.toBeInTheDocument()
  })

  it('shows the section pill only when a section is set', () => {
    render(<VideoPreview video={VIDEO} section={{ start: '3:15', end: '7:40' }} />)
    expect(screen.getByTestId('section-pill')).toHaveTextContent('3:15 → 7:40')
  })

  it('a section with an open end reads "até o fim"', () => {
    render(<VideoPreview video={VIDEO} section={{ start: '3:15', end: 'inf' }} />)
    expect(screen.getByTestId('section-pill')).toHaveTextContent('3:15 → fim')
  })

  it('swaps the thumbnail for a placeholder when it fails to load', () => {
    const { container } = render(
      <VideoPreview video={{ ...VIDEO, thumbnail: 'https://i.ytimg.com/broken.jpg' }} />,
    )
    const img = container.querySelector('img') as HTMLImageElement
    act(() => {
      img.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('thumb-placeholder')).toBeInTheDocument()
  })

  it('a video with no thumbnail, duration, channel or date still renders', () => {
    const bare: VideoInfo = {
      ...VIDEO,
      thumbnail: null,
      duration: null,
      channel: null,
      uploadDate: null,
      formats: [],
    }
    const { container } = render(<VideoPreview video={bare} />)
    expect(screen.getByRole('heading', { name: VIDEO.title })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('thumb-placeholder')).toBeInTheDocument()
    expect(screen.queryByText(/Publicado/)).not.toBeInTheDocument()
  })

  it('writes an hour-long duration as h:mm:ss', () => {
    render(<VideoPreview video={{ ...VIDEO, duration: 3723 }} />)
    expect(screen.getByText('1:02:03')).toBeInTheDocument()
  })
})

describe('on the Download screen', () => {
  const DEPS: DepsStatus = {
    ytdlp: { path: '/bin/yt-dlp', version: '1' },
    ffmpeg: { path: '/bin/ffmpeg', version: '1', source: 'app' },
    deno: { path: '/bin/deno', version: '1', source: 'app' },
  }

  async function screenSetup() {
    const bridge: MockBridge = createMockBridge({
      deps: DEPS,
      fallbackProbe: {
        code: 0,
        stdout: JSON.stringify({ ...JSON.parse(videoRaw), filename: FILENAME }),
        stderr: '',
      },
    })
    await useSettings.getState().load(bridge)
    await useQueue.getState().load(bridge)
    useSettings.setState((s) => ({
      settings: { ...s.settings, outputDir: 'C:\\Videos\\ytdlp-gui' },
    }))
    const user = userEvent.setup()
    renderApp(bridge)
    await user.click(screen.getByRole('textbox', { name: 'Link do vídeo ou da playlist' }))
    await user.paste(VIDEO_URL)
    await screen.findByRole('region', { name: 'Opções de download' })
    return { bridge, user }
  }

  beforeEach(() => {
    useUi.setState({ screen: 'download', sidebarCollapsed: false })
    useQueue.setState({ jobs: [], activeCount: 0, terminating: [] })
  })

  it('shows the preview and the panel next to each other', async () => {
    await screenSetup()
    expect(screen.getByRole('heading', { name: VIDEO.title })).toBeInTheDocument()
    expect(within(panel()).getByText(FILENAME)).toBeInTheDocument()
    expect(screen.getByText('2160p60')).toBeInTheDocument()
  })

  it('"Baixar" enqueues the job, goes to the Queue and shows the toast', async () => {
    const { user } = await screenSetup()
    await user.click(chip(/^720p/))
    await user.click(download())

    const jobs = useQueue.getState().jobs
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      url: VIDEO_URL,
      title: VIDEO.title,
      videoId: 'aqz-KE-bpKQ',
      extractor: 'youtube',
    })
    // The args are built right after enqueueing, from the options chosen in the panel.
    await waitFor(() => {
      expect(useQueue.getState().jobs[0].args).toContain('bv*[height<=720]+ba/b[height<=720]')
    })
    expect(useQueue.getState().jobs[0].args.slice(-1)[0]).toBe(VIDEO_URL)
    expect(useUi.getState().screen).toBe('queue')
    expect((await screen.findAllByText('Adicionado à fila')).length).toBeGreaterThan(0)
  })

  it('the section set in the panel shows up as a pill in the preview', async () => {
    const { user } = await screenSetup()
    await user.click(within(panel()).getByRole('button', { name: /Baixar só um trecho/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Início' }), '3:15')
    await user.type(within(dialog).getByRole('textbox', { name: 'Fim' }), '7:40')
    await user.keyboard('{Escape}')
    expect(screen.getByTestId('section-pill')).toHaveTextContent('3:15 → 7:40')
  })
})
