import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'

type Props = {
  onChange: (blob: Blob | null) => void
}

export function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const snapshot = hasInk ? canvas.toDataURL('image/png') : null
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(180 * ratio))
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(ratio, ratio)
      context.lineWidth = 2
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.strokeStyle = '#25231F'
      if (snapshot) {
        const image = new Image()
        image.onload = () => context.drawImage(image, 0, 0, rect.width, 180)
        image.src = snapshot
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [hasInk])

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = pointFromEvent(event)
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const previous = lastPointRef.current
    if (!canvas || !previous) return
    const current = pointFromEvent(event)
    const context = canvas.getContext('2d')
    if (!context) return
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(current.x, current.y)
    context.stroke()
    lastPointRef.current = current
    if (!hasInk) setHasInk(true)
  }

  function finish(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas || !drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (!hasInk) return
    canvas.toBlob((blob) => onChange(blob), 'image/png')
  }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ border: '1px solid #E8E3D9', borderRadius: 12, background: '#FFFFFF', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          aria-label="Draw your signature"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          style={{ display: 'block', width: '100%', height: 180, touchAction: 'none', cursor: 'crosshair' }}
        />
      </div>
      <div className="action-buttons">
        <Button type="button" variant="secondary" onClick={clear} disabled={!hasInk}>Clear signature</Button>
        <span className="muted-label">Use mouse, touch, or stylus. The signature is captured only for this submission.</span>
      </div>
    </div>
  )
}
