import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
}

export function Input({ error, hint, id, label, ...props }: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replaceAll(' ', '-') : undefined)

  if (label) {
    return (
      <label className="field" htmlFor={inputId}>
        <span>{label}</span>
        <input id={inputId} aria-invalid={Boolean(error)} {...props} />
        {error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}
      </label>
    )
  }

  return <input id={inputId} aria-invalid={Boolean(error)} {...props} />
}
