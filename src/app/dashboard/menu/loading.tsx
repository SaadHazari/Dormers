export default function MenuLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ width: 240, height: 18, borderRadius: 6, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 8 }} />
        <div style={{ width: 320, height: 28, borderRadius: 6, background: 'rgba(9,24,37,0.06)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 24 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 24 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ height: 140, borderRadius: 14, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <div style={{ height: 280, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          <div style={{ height: 280, borderRadius: 16, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @media (max-width: 1024px) {
          [style*="grid-template-columns: repeat(7, 1fr)"] > *,
          [style*="grid-template-columns: repeat(2, 1fr)"] > * {
            grid-column: span 1 !important;
          }
          [style*="grid-template-columns: repeat(7, 1fr)"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          [style*="grid-template-columns: repeat(2, 1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
