import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './PillButton.module.css'

interface PillButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant: 'primary' | 'ghost'
  icon?: IconName
  children: ReactNode
}

export function PillButton({ variant, icon, children, type = 'button', ...rest }: PillButtonProps) {
  return (
    <button type={type} className={`${styles.pill} ${styles[variant]}`} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  )
}
