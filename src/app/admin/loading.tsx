export default function AdminLoading() {
  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <div style={{ height: 28, width: 180, background: 'rgba(9,24,37,0.06)', borderRadius: 6, marginBottom: 24, animation: 'adm-pulse 1.4s ease-in-out infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} style={{ height: 120, background: 'rgba(9,24,37,0.04)', borderRadius: 10, animation: 'adm-pulse 1.4s ease-in-out infinite' }} />
        ))}
      </div>
      <style>{`
        @keyframes adm-pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}
