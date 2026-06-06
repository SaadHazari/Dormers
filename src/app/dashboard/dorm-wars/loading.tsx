// Streamed loading state for /dashboard/dorm-wars. Without this file the
// route shows a blank flash while page.tsx awaits its 7+ parallel queries
// (customer, referralData, invites, activeSubscription, dailyDrop, streak,
// rewards, cycleRecruits, perkFlags). Matches the dorm-wars
// hub palette (navy ground + warm orange accent) so the transition into
// the loaded hub feels continuous, not a theme jump.

export default function HubLoading() {
  return (
    <div
      className="hub-loading"
      style={{
        backgroundColor: '#091825',
        backgroundImage:
          'radial-gradient(ellipse at 50% -15%, rgba(245,127,32,0.14) 0%, transparent 55%),' +
          'linear-gradient(180deg, #091825 0%, #1e3a4f 55%, #162f40 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 32, height: 32,
          borderRadius: '50%',
          border: '2px solid rgba(237,232,218,0.18)',
          borderTopColor: '#f57f20',
          animation: 'hub-loading-spin 0.9s linear infinite',
        }}
      />
      <style>{`@keyframes hub-loading-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
