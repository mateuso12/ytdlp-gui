interface BrandMarkProps {
  /** Rendered size in px (the mark is square). */
  size?: number
  className?: string
}

/** The ytdlp-gui glyph (see docs/assets/logo-mark.svg): triangle follows the text color, bar is the brand red. */
export function BrandMark({ size = 22, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="25 24.5 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M44 35h62L75 89z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <rect x="33" y="106" width="84" height="13" rx="6.5" fill="#ff0033" />
    </svg>
  )
}
