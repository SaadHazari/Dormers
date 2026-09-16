import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SEASON_NOTICE_KINDS, SEASON_EMAIL_TEMPLATES, aedText, firstNameOf,
  seasonEmailTemplateFor, seasonWhatsAppPayload, seasonWhatsAppWanted,
  type SeasonEmailKind,
} from './season-messages'

const ROOT = resolve(__dirname, '../../../..')
const payload = { plan_name: 'Monthly Premium', wrap_up_day: '2026-10-03', last_dinner: '2026-10-01', held_meals: 9, credit_aed: 20, offer_aed: 15, reason: '  The card has expired.  ' }
const ALL_KINDS = Object.keys(SEASON_EMAIL_TEMPLATES) as SeasonEmailKind[]

describe('season messages (spec §12)', () => {
  it('reads amounts the way a customer does', () => {
    expect(aedText(20)).toBe('20')
    expect(aedText('19.8')).toBe('19.80')
    expect(aedText(null)).toBe('0')
    expect(firstNameOf('  Omar Farouk ')).toBe('Omar')
    expect(firstNameOf(null)).toBe('there')
  })

  it('sends each moment to its own ZeptoMail template', () => {
    expect(seasonEmailTemplateFor('season_plan_held', payload)).toEqual({
      name: 'season-plan-held',
      envKey: 'ZEPTOMAIL_TPL_SEASON_PLAN_HELD',
      mergeInfo: { plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20' },
    })
    expect(seasonEmailTemplateFor('season_plan_runs_past', payload).mergeInfo)
      .toEqual({ wrap_up_day: 'Sat 3 Oct', held_meals: '9', credit_aed: '20' })
    expect(seasonEmailTemplateFor('season_last_dinners', payload).mergeInfo)
      .toEqual({ last_dinner: 'Thu 1 Oct', wrap_up_day: 'Sat 3 Oct', offer_aed: '15' })
    expect(seasonEmailTemplateFor('season_pause_carries', payload).mergeInfo)
      .toEqual({ plan_name: 'Monthly Premium', offer_aed: '15' })
    expect(seasonEmailTemplateFor('season_plan_ready', payload).mergeInfo)
      .toEqual({ plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20' })
    expect(seasonEmailTemplateFor('season_credit_waiting', payload).mergeInfo).toEqual({ credit_aed: '20' })
    expect(seasonEmailTemplateFor('season_spot_saved', payload).mergeInfo).toEqual({ credit_aed: '20' })
    expect(seasonEmailTemplateFor('season_refund_declined', payload).mergeInfo)
      .toEqual({ plan_name: 'Monthly Premium', held_meals: '9', reason: 'The card has expired.' })
  })

  it('leaves an amount of zero out entirely, so its block cannot render blank', () => {
    // ZeptoMail Mustache treats '' as true: the key must be absent, not empty.
    expect(seasonEmailTemplateFor('season_plan_held', { ...payload, credit_aed: 0 }).mergeInfo)
      .toEqual({ plan_name: 'Monthly Premium', held_meals: '9' })
    expect(seasonEmailTemplateFor('season_pause_carries', { ...payload, offer_aed: 0 }).mergeInfo)
      .toEqual({ plan_name: 'Monthly Premium' })
    expect(seasonEmailTemplateFor('season_plan_runs_past', { ...payload, credit_aed: undefined }).mergeInfo)
      .not.toHaveProperty('credit_aed')
  })

  it('every template file exists and uses exactly the merge keys the code sends', () => {
    for (const kind of ALL_KINDS) {
      const template = seasonEmailTemplateFor(kind, payload)
      const html = readFileSync(resolve(ROOT, `docs/email-templates/${template.name}.html`), 'utf-8')
      const body = html.replace(/<!--[\s\S]*?-->/g, '')
      const inHtml = new Set([...body.matchAll(/\{\{[#/]?(\w+)\}\}/g)].map((m) => m[1]))
      // first_name is added by the sender, so every template may use it.
      const canSend = new Set(['first_name', ...Object.keys(template.mergeInfo)])
      for (const key of inHtml) expect(canSend, `${template.name} renders {{${key}}}`).toContain(key)
      for (const key of Object.keys(template.mergeInfo)) expect([...inHtml], `${template.name} uses ${key}`).toContain(key)
    }
  })

  it('every template carries the brand banner and no emoji or dash in its copy', () => {
    for (const kind of ALL_KINDS) {
      const name = SEASON_EMAIL_TEMPLATES[kind].name
      const html = readFileSync(resolve(ROOT, `docs/email-templates/${name}.html`), 'utf-8')
      const body = html.replace(/<!--[\s\S]*?-->/g, '')
      expect(body, name).toContain('https://dormers.ae/email-mark.png')
      expect(body, name).toContain('class="brand-banner')
      expect(body, name).toMatch(/prefers-color-scheme: dark/)
      expect(body, name).not.toMatch(/[–—]/)
      expect(body, name).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
      // Trap 1 in EMAIL-DESIGN.md: a collapsed border model squares every box.
      // The style block explains why it is absent, so match the declaration.
      expect(body, name).not.toMatch(/border-collapse\s*:/)
    }
  })

  it('maps each kind to its WhatsApp parameters (spec §12.4), dates left ISO for the dispatcher', () => {
    expect(seasonWhatsAppPayload('season_plan_runs_past', payload)).toEqual({ wrap_up_day: '2026-10-03', held_meals: '9', credit_aed: '20' })
    expect(seasonWhatsAppPayload('season_last_dinners', payload)).toEqual({ last_dinner: '2026-10-01', wrap_up_day: '2026-10-03', offer_aed: '15' })
    expect(seasonWhatsAppPayload('season_plan_held', payload)).toEqual({ plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20' })
    expect(seasonWhatsAppPayload('season_pause_carries', payload)).toEqual({ plan_name: 'Monthly Premium', offer_aed: '15' })
    expect(seasonWhatsAppPayload('season_plan_ready', payload)).toEqual({ held_meals: '9', plan_name: 'Monthly Premium' })
    expect(seasonWhatsAppPayload('season_credit_waiting', payload)).toEqual({ credit_aed: '20' })
    expect(SEASON_NOTICE_KINDS).toHaveLength(6)
  })

  it('sends no template whose amount would read 0', () => {
    expect(seasonWhatsAppWanted('season_plan_held', payload)).toBe(true)
    expect(seasonWhatsAppWanted('season_plan_held', { ...payload, credit_aed: 0 })).toBe(false)
    expect(seasonWhatsAppWanted('season_last_dinners', { ...payload, offer_aed: 0 })).toBe(false)
    expect(seasonWhatsAppWanted('season_plan_ready', { ...payload, credit_aed: 0 })).toBe(true)
  })
})
