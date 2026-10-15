/**
 * Output extensions yt-dlp's EmbedThumbnail post-processor can write a cover into. Anything else
 * (WebM above all) makes it raise an error after the download, which fails the job.
 */
const THUMBNAIL_EXTENSIONS = new Set([
  'mp3',
  'mka',
  'mkv',
  'ogg',
  'opus',
  'flac',
  'm4a',
  'mp4',
  'm4v',
  'mov',
])

/**
 * Whether `--embed-thumbnail` is safe for the file a download will produce. `output` is its
 * extension: the container in video mode, the format in audio mode, and for advanced mode the
 * container the chosen tracks merge into (see {@link advancedOutputExt}); `null` is unknown.
 */
export function canEmbedThumbnail(output: string | null): boolean {
  return output !== null && THUMBNAIL_EXTENSIONS.has(output.toLowerCase())
}

const MP4_VIDEO = new Set(['mp4', 'm4v', 'mov'])
const MP4_AUDIO = new Set(['m4a', 'mp4'])

/**
 * The extension of the file yt-dlp makes from one video and one audio track: the shared one, MP4
 * for MP4 video with M4A audio, and MKV for anything that does not fit one container.
 */
export function advancedOutputExt(videoExt: string | null, audioExt: string | null): string | null {
  if (videoExt === null) return audioExt
  if (audioExt === null) return videoExt
  if (videoExt === audioExt) return videoExt
  return MP4_VIDEO.has(videoExt) && MP4_AUDIO.has(audioExt) ? 'mp4' : 'mkv'
}
