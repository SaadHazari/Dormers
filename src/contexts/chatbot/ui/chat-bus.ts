/**
 * Tiny window-event bus for opening/closing the AI chatbot from
 * anywhere in the app (e.g. ChatButton triggers, escalation CTAs).
 *
 * Replaces magic event-name strings (`'open-chat'` / `'close-chat'`)
 * that were referenced 5 times across ChatButton and AIChatbot.
 */

const OPEN_EVENT = 'open-chat'
const CLOSE_EVENT = 'close-chat'

export function openChat(): void {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}

export function closeChat(): void {
    window.dispatchEvent(new CustomEvent(CLOSE_EVENT))
}

/**
 * Subscribe to open/close events. Pass a setter (or any
 * `(open: boolean) => void` callback) and call the returned cleanup
 * from a `useEffect` return.
 *
 * Usage:
 *   useEffect(() => subscribeChatBus(setIsOpen), [])
 */
export function subscribeChatBus(setOpen: (open: boolean) => void): () => void {
    const handleOpen = () => setOpen(true)
    const handleClose = () => setOpen(false)
    window.addEventListener(OPEN_EVENT, handleOpen)
    window.addEventListener(CLOSE_EVENT, handleClose)
    return () => {
        window.removeEventListener(OPEN_EVENT, handleOpen)
        window.removeEventListener(CLOSE_EVENT, handleClose)
    }
}
