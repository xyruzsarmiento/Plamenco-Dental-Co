import type { TextareaHTMLAttributes } from 'react'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  hint?: string
  error?: string
}

export function Textarea({ error, hint, id, label, ...props }: TextareaProps) {
  const textareaId = id ?? label.toLowerCase().replaceAll(' ', '-')

  return (
    <label className="field" htmlFor={textareaId}>
      <span>{label}</span>
      <textarea id={textareaId} aria-invalid={Boolean(error)} {...props} />
      {error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  )
}
