"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle } from "lucide-react"

type Position = { x: number; y: number }
type DragState = {
  pointerId: number
  startX: number
  startY: number
  baseX: number
  baseY: number
  moved: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function FloatingChatButton({ count = 0 }: { count?: number }) {
  const router = useRouter()
  const [position, setPosition] = useState<Position | null>(null)
  const drag = useRef<DragState | null>(null)

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: rect.left,
      baseY: rect.top,
      moved: false,
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return

    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (Math.hypot(dx, dy) > 4) state.moved = true

    const width = event.currentTarget.offsetWidth
    const height = event.currentTarget.offsetHeight
    const maxX = Math.max(8, window.innerWidth - width - 8)
    const maxY = Math.max(8, window.innerHeight - height - 72)

    setPosition({
      x: clamp(state.baseX + dx, 8, maxX),
      y: clamp(state.baseY + dy, 8, maxY),
    })
  }

  function finish(event: React.PointerEvent<HTMLButtonElement>) {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!state.moved) router.push("/chat")
  }

  return <button
    type="button"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finish}
    onPointerCancel={() => { drag.current = null }}
    aria-label={count ? `Chat, ${count} gemiste berichten. Sleep om te verplaatsen.` : "Chat. Sleep om te verplaatsen."}
    title="Chat — sleep om te verplaatsen"
    style={position ? { left: position.x, top: position.y } : { right: "1rem", bottom: "5rem" }}
    className="fixed z-50 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-white/30 bg-black text-white shadow-lg md:hidden"
  >
    <MessageCircle className="h-7 w-7"/>
    {count > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-black leading-none text-white shadow ring-2 ring-background">
      {count > 99 ? "99+" : count}
    </span>}
  </button>
}
