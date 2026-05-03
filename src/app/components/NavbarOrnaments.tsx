// Golden-ratio decorative rings — desktop only, behind the nav pill.
// Radii: nav height ~62px → φ = 1.618
//   Large ring:  62 × φ² ≈ 162px  (anchored left-of-center)
//   Medium ring: 62 × φ  ≈ 100px  (anchored right-of-center)
//   Small ring:  62px             (anchored far right)
// All pointer-events-none, z-[-1], so they never block interaction.
const RINGS = [
  { size: 162, opacity: 0.10, position: { left: 'calc(50% - 280px)' as const } },
  { size: 100, opacity: 0.08, position: { left: 'calc(50% + 140px)' as const } },
  { size:  62, opacity: 0.06, position: { right: 'calc(6% + 70px)' as const } },
]

export function NavbarOrnaments() {
  return (
    <>
      {RINGS.map((ring, i) => (
        <span
          key={i}
          aria-hidden
          className="hidden lg:block pointer-events-none select-none absolute z-[-1]"
          style={{
            width: ring.size,
            height: ring.size,
            top: '50%',
            transform: 'translateY(-50%)',
            borderRadius: '50%',
            border: `1px solid rgba(245,127,32,${ring.opacity})`,
            ...ring.position,
          }}
        />
      ))}
    </>
  )
}
