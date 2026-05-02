export default function PlanLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ width: 200, height: 18, borderRadius: 6, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 8 }} />
        <div style={{ width: 360, height: 32, borderRadius: 6, background: 'rgba(9,24,37,0.06)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 24 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
          <div style={{ gridColumn: 'span 8', height: 320, borderRadius: 16, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          <div style={{ gridColumn: 'span 4', height: 320, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />

          <div style={{ gridColumn: 'span 12', height: 80, borderRadius: 14, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />

          <div style={{ gridColumn: 'span 6', height: 220, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          <div style={{ gridColumn: 'span 6', height: 220, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
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
