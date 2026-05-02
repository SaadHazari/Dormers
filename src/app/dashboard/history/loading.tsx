export default function HistoryLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ width: 180, height: 18, borderRadius: 6, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 8 }} />
        <div style={{ width: 260, height: 32, borderRadius: 6, background: 'rgba(9,24,37,0.06)', animation: 'pulse 1.4s ease-in-out infinite', marginBottom: 28 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 96, borderRadius: 14, background: 'rgba(9,24,37,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}
