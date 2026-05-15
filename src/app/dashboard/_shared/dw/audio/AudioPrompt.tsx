'use client'

import { Volume2, VolumeX } from 'lucide-react'  // Wave 5 swaps to stencil icons
import { OG, NV2, CR, BODY } from '../../tokens'

type AudioPromptProps = {
  enabled: boolean
  onToggle: () => void
}

/**
 * ENABLE AUDIO pre-prompt pill (UI-SPEC ENABLE-AUDIO Pre-Prompt).
 * Position is owned by DormWarsClient (rendered in hero rank-pill row, replacing Phase 5 <SoundToggle />).
 *
 * Off state: VolumeX icon + "ENABLE AUDIO" text.
 * On state:  Volume2 icon + "AUDIO ON" text.
 *
 * Persistence is owned by useSound() / DormWarsClient via `dw-audio-enabled` localStorage key.
 * This component is purely visual — onToggle should call the toggle function from useSound().
 *
 * Reduced-motion: no animation here (pill is static).
 */
export function AudioPrompt({ enabled, onToggle }: AudioPromptProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 32,
        padding: '4px 12px',
        fontFamily: BODY,
        fontSize: 12,
        fontWeight: 600,
        color: CR,
        backgroundColor: NV2,
        border: `1px solid ${OG}`,
        borderRadius: 16,
        cursor: 'pointer',
        letterSpacing: '0.04em',
      }}
      aria-pressed={enabled}
      aria-label={enabled ? 'Audio on. Tap to disable.' : 'Enable audio'}
    >
      {enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
      <span>{enabled ? 'AUDIO ON' : 'ENABLE AUDIO'}</span>
    </button>
  )
}
