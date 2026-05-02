export default function ExplorePlansLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ width: 220, height: 18, borderRadius: 6, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 8 }} />
        <div style={{ width: 380, height: 32, borderRadius: 6, background: 'rgba(9,24,37,0.06)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 28 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 460, borderRadius: 18, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @media (max-width: 1024px) {
          [style*="grid-template-columns: repeat(3, 1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
