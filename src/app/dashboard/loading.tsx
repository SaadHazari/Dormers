// Shared loading skeleton for every dashboard sub-route. Matches the new
// 4-section layout: hero (full-width) → plan + week rail → refer card.
export default function DashboardLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Greeting line */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ width: 220, height: 18, borderRadius: 6, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
        </div>

        {/* 4-section grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
          {/* Hero — full width */}
          <div style={{ gridColumn: 'span 12', height: 460, borderRadius: 16, background: 'rgba(9,24,37,0.06)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          {/* Plan + Week rail */}
          <div style={{ gridColumn: 'span 4', height: 360, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          <div style={{ gridColumn: 'span 8', height: 360, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          {/* Refer card */}
          <div style={{ gridColumn: 'span 12', height: 120, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @media (max-width: 1024px) {
          [style*="grid-template-columns: repeat(12, 1fr)"] > * {
            grid-column: span 12 !important;
          }
        }
      `}</style>
    </div>
  )
}
