import { describe, it, expect } from 'vitest'
import { buildBroadcastEmailHtml, buildSeasonReopenMergeInfo, personalizeBroadcast, reasonLineFor } from './broadcast-shell'

describe('personalizeBroadcast', () => {
  it('replaces every {{first_name}} token, tolerating inner whitespace', () => {
    expect(personalizeBroadcast('Hi {{first_name}}, {{ first_name }}!', 'Ahmed'))
      .toBe('Hi Ahmed, Ahmed!')
  })
  it('leaves text without tokens untouched', () => {
    expect(personalizeBroadcast('No tokens here.', 'Ahmed')).toBe('No tokens here.')
  })
})

describe('reasonLineFor', () => {
  it('is truthful per audience', () => {
    expect(reasonLineFor('early_access')).toBe('You are getting this because you asked to hear from us.')
    expect(reasonLineFor('everyone')).toBe('You are getting this because you have a Dormers account.')
    expect(reasonLineFor('active_plans')).toBe('You are getting this because you have a Dormers plan.')
    expect(reasonLineFor('ended_not_renewed')).toBe('You are getting this because you were on a Dormers plan before.')
    expect(reasonLineFor('dorm')).toBe('You are getting this because you have a Dormers account.')
  })
})

describe('buildSeasonReopenMergeInfo', () => {
  it('gives credit holders the credit block and "Use my credit"', () => {
    const result = buildSeasonReopenMergeInfo({ firstName: 'Ahmed', isWaitlistMember: true, unspentCreditAed: 20 })
    expect(result.credit_aed).toBe('20')
    expect(result.cta_label).toBe('Use my credit')
  })
  it('omits credit_aed entirely (not "") when there is no unspent credit', () => {
    const result = buildSeasonReopenMergeInfo({ firstName: 'Ahmed', isWaitlistMember: true, unspentCreditAed: 0 })
    expect('credit_aed' in result).toBe(false)
    expect(result.cta_label).toBe('Restart my plan')
  })
  it('gives waitlist members the "asked to hear" footer reason', () => {
    const result = buildSeasonReopenMergeInfo({ firstName: 'Ahmed', isWaitlistMember: true, unspentCreditAed: 0 })
    expect(result.footer_reason).toBe('You are getting this because you asked to hear when we reopened.')
  })
  it('gives non-members the "was on a plan before" footer reason', () => {
    const result = buildSeasonReopenMergeInfo({ firstName: 'Ahmed', isWaitlistMember: false, unspentCreditAed: 0 })
    expect(result.footer_reason).toBe('You are getting this because you were on a Dormers plan before.')
  })
})

describe('buildBroadcastEmailHtml', () => {
  const base = {
    firstName: 'Ahmed',
    heading: 'A quick heads up, {{first_name}}.',
    bodyText: 'First paragraph.\n\nSecond <paragraph> & more.',
    reasonLine: 'You are getting this because you have a Dormers account.',
  }
  it('personalizes the heading and splits body on blank lines', () => {
    const html = buildBroadcastEmailHtml(base)
    expect(html).toContain('A quick heads up, Ahmed.')
    expect(html).toContain('First paragraph.')
    expect(html).toContain('Second &lt;paragraph&gt; &amp; more.')
  })
  it('escapes admin HTML rather than rendering it', () => {
    const html = buildBroadcastEmailHtml({ ...base, heading: '<script>x</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('renders the CTA box only when both label and url are present', () => {
    expect(buildBroadcastEmailHtml(base)).not.toContain('cta-button')
    const withCta = buildBroadcastEmailHtml({ ...base, ctaLabel: 'See the menu', ctaUrl: 'https://dormers.ae/menu' })
    expect(withCta).toContain('See the menu')
    expect(withCta).toContain('https://dormers.ae/menu')
  })
  it('carries the card format invariants', () => {
    const html = buildBroadcastEmailHtml(base)
    expect(html).toContain('border:2px solid #f57f20')          // perimeter border
    expect(html).toContain('https://dormers.ae/email-mark.png') // lockup mark
    expect(html).toContain('DORMERS&rsquo;')                    // live-text wordmark
    expect(html).toContain('https://wa.me/971504619384')        // support box
    expect(html).toContain(base.reasonLine)                     // truthful footer
    expect(html).not.toContain('border-collapse')               // the trap stays out
  })
})
