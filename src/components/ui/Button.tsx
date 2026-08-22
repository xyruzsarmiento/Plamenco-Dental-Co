import { Children, isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({
  children,
  className = '',
  icon,
  size = 'md',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const childArray = Children.toArray(children)
  const inferredLeadingIcon = !icon && childArray.length > 1 && isValidElement(childArray[0]) ? childArray[0] : null
  const label = inferredLeadingIcon ? childArray.slice(1) : children

  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`.trim()}
      type={props.type ?? 'button'}
      {...props}
    >
      {icon ?? inferredLeadingIcon}
      <span>{label}</span>
    </button>
  )
}
