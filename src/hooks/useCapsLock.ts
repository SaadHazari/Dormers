'use client'

import { useState, type KeyboardEvent } from 'react'

// Detects whether Caps Lock is engaged while the user is typing in an input.
// Spread the returned handlers onto an <input> to wire it up:
//   const { capsOn, ...handlers } = useCapsLock()
//   <input {...handlers} />
export function useCapsLock() {
    const [capsOn, setCapsOn] = useState(false)
    const handler = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.getModifierState) setCapsOn(e.getModifierState('CapsLock'))
    }
    return { capsOn, onKeyDown: handler, onKeyUp: handler }
}
