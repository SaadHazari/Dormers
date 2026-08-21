'use client'

import { useState } from 'react'
import { FoundingMemberArrival } from '@/app/dashboard/_shared/FoundingMemberArrival'
import { SPOT_SAVED_NO_CREDIT_YET_MESSAGE } from '@/contexts/subscriptions/domain/credit-eligibility'
import { BODY, OG } from '@/app/dashboard/_shared/tokens'

export function PreviewClient({ firstName, creditAed }: { firstName: string; creditAed: number }) {
  const [open, setOpen] = useState(true)

  return (
    <div style={{ minHeight: '100vh', background: '#ede8da', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            minHeight: 48, padding: '14px 32px', border: 0,
            borderRadius: 'var(--radius-pill)', background: OG, color: '#fff',
            fontFamily: BODY, fontSize: 13, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          Replay the arrival
        </button>
      )}
      {open && (
        <FoundingMemberArrival
          firstName={firstName}
          creditAed={creditAed}
          // Mirrors the real contract: a zero amount always arrives with the
          // action's reassurance message, never a bare zero.
          message={creditAed > 0 ? null : SPOT_SAVED_NO_CREDIT_YET_MESSAGE}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
