// Phase 6 D-04 stencil icon catalog (16 icons): 5 ranks + 5 drops + 3 mission rewards + 3 HUD.
// All icons follow uniform spec: 24×24 viewBox, 1.5px stroke, currentColor, fill="none",
// stroke-primary discipline. Legible at 12px AND 48px.

export { RankSoldier }         from './RankSoldier'
export { RankSergeant }        from './RankSergeant'
export { RankCommander }       from './RankCommander'
export { RankWarHero }         from './RankWarHero'
export { RankFounder }         from './RankFounder'
export { DropCredit }          from './DropCredit'
export { DropMultiplier }      from './DropMultiplier'
export { DropSkip }            from './DropSkip'
export { DropSpotlight }       from './DropSpotlight'
export { DropIntel }           from './DropIntel'
export { RewardFreeSkip }      from './RewardFreeSkip'
export { RewardFreeWeek }      from './RewardFreeWeek'
export { RewardPauseUnlocked } from './RewardPauseUnlocked'
export { HudWallet }           from './HudWallet'
export { HudFlame }            from './HudFlame'
export { HudCallsign }         from './HudCallsign'

export { NinesliceStampedBorder } from './NinesliceStampedBorder'

// Rank ladder helper map. Used by RankChevron (HUD), RankUpCutscene (cinema),
// HUDPill (mobile collapsed) — picks the right icon by rank slug.
import type { ComponentType, SVGProps } from 'react'
import { RankSoldier }   from './RankSoldier'
import { RankSergeant }  from './RankSergeant'
import { RankCommander } from './RankCommander'
import { RankWarHero }   from './RankWarHero'
import { RankFounder }   from './RankFounder'

export type RankSlug = 'soldier' | 'sergeant' | 'commander' | 'war-hero' | 'founder'
export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

export const RANK_ICONS: Record<RankSlug, IconComponent> = {
  soldier:    RankSoldier,
  sergeant:   RankSergeant,
  commander:  RankCommander,
  'war-hero': RankWarHero,
  founder:    RankFounder,
}

/**
 * Map a human-readable rank label ("Soldier" / "Sergeant" / "Commander" / "War Hero" / "Founder")
 * to its filesystem-friendly slug. Used as a single source of truth so consumers
 * (RankChevron, RankUpCutscene, HUDPill) don't reinvent the mapping.
 */
export function rankToSlug(rank: string): RankSlug {
  const r = rank.toLowerCase()
  if (r.startsWith('serg')) return 'sergeant'
  if (r.startsWith('comm')) return 'commander'
  if (r.startsWith('war'))  return 'war-hero'
  if (r.startsWith('foun')) return 'founder'
  return 'soldier'
}
