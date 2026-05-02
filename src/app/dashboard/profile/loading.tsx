export default function ProfileLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ width: 160, height: 18, borderRadius: 6, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 8 }} />
        <div style={{ width: 240, height: 32, borderRadius: 6, background: 'rgba(9,24,37,0.06)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 28 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'center' }}>
              <div style={{ height: 14, borderRadius: 4, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <div style={{ height: 44, borderRadius: 10, background: 'rgba(9,24,37,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @media (max-width: 1024px) {
          [style*="grid-template-columns: 160px 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
