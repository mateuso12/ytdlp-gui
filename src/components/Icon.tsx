import {
  AlertCircle,
  ArrowDownToLine,
  AudioLines,
  Captions,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  Clapperboard,
  Clipboard,
  Cookie,
  Cpu,
  Download,
  ExternalLink,
  Film,
  Folder,
  FolderOpen,
  History,
  Image,
  ListVideo,
  Menu,
  MonitorPlay,
  Music2,
  RotateCcw,
  Search,
  Scissors,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  SunMoon,
  Trash2,
  Video,
  X,
} from 'lucide-react'

// The only file that knows about the icon library (spec section 3.1).
export const icons = {
  menu: Menu,
  download: Download,
  'list-video': ListVideo,
  history: History,
  'settings-2': Settings2,
  clipboard: Clipboard,
  'circle-check': CircleCheck,
  check: Check,
  'chevron-right': ChevronRight,
  'sun-moon': SunMoon,
  folder: Folder,
  captions: Captions,
  'shield-check': ShieldCheck,
  image: Image,
  scissors: Scissors,
  clapperboard: Clapperboard,
  'music-2': Music2,
  'sliders-horizontal': SlidersHorizontal,
  'arrow-down-to-line': ArrowDownToLine,
  cpu: Cpu,
  film: Film,
  cookie: Cookie,
  'check-circle-2': CheckCircle2,
  'monitor-play': MonitorPlay,
  'audio-lines': AudioLines,
  video: Video,
  x: X,
  'rotate-ccw': RotateCcw,
  'external-link': ExternalLink,
  'folder-open': FolderOpen,
  'alert-circle': AlertCircle,
  'trash-2': Trash2,
  search: Search,
} as const

export type IconName = keyof typeof icons

interface IconProps {
  name: IconName
  size?: 16 | 18 | 20
}

export function Icon({ name, size = 20 }: IconProps) {
  const Glyph = icons[name]
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />
}
