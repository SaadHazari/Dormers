// src/app/api/ops/whatsapp-inbound/route.ts
// Phase 8 — WhatsApp inbound delivery trigger.
//
// GET  — Meta webhook verification handshake (WAI-01)
// POST — Inbound message processing (WAI-02 through WAI-08)
//
// Processing flow:
//   1. req.text() — raw body for HMAC (MUST be first — never req.json() first)
//   2. verifyHmac() — reject tampered or unsigned payloads (WAI-02)
//   3. Return 200 immediately (WAI-03)
//   4. IIFE: parse payload → dedup check → allowlist check → fuzzy match → delivery update

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { matchDormName } from '@/contexts/ops/domain/dorm-name-fuzzy-match'
import { updateDeliveryEvent } from '@/contexts/ops/usecases/update-delivery-event'
import { queueDeliveryConfirmedNotifications } from '@/contexts/ops/usecases/queue-delivery-confirmed-notifications'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Types — Meta webhook payload (authoritative shape from 08-RESEARCH.md)
// ---------------------------------------------------------------------------

interface MetaWebhookMessage {
  from: string // digits-only, no + (e.g. "971504619384")
  id: string // wamid e.g. "wamid.HBgL..."
  timestamp: string
  type: string // "text" | "image" | "audio" | "reaction" | ...
  text?: { body: string } // present only when type === "text"
}

interface MetaWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      field: string
      value: {
        messaging_product: string
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: MetaWebhookMessage[]
        statuses?: Array<{
          id: string
          status: string
          recipient_id: string
        }>
      }
    }>
  }>
}

// ---------------------------------------------------------------------------
// GET — Meta webhook verification handshake (WAI-01)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const mode = p.get('hub.mode')
  const token = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge')

  if (
    mode === 'subscribe' &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — Inbound message processing (WAI-02, WAI-03)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // CRITICAL: req.text() FIRST — JSON.parse() after HMAC check
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('x-hub-signature-256')

  if (!verifyHmac(rawBody, signatureHeader)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as MetaWebhookPayload

  // Run processing + Chatwoot relay in parallel, then return 200.
  // Cannot use fire-and-forget on Netlify — serverless kills the
  // function after the response, so the IIFE never completes.
  await Promise.all([
    processAsync(payload),
    relayChatwoot(rawBody, signatureHeader),
  ])
  return NextResponse.json({ status: 'ok' })
}

// ---------------------------------------------------------------------------
// Chatwoot relay — forward every payload so the team inbox keeps working
// ---------------------------------------------------------------------------

const CHATWOOT_WEBHOOK_URL =
  'https://app.chatwoot.com/webhooks/whatsapp/+971522615450'

async function relayChatwoot(
  rawBody: string,
  signatureHeader: string | null,
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (signatureHeader) {
      headers['X-Hub-Signature-256'] = signatureHeader
    }
    await fetch(CHATWOOT_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: rawBody,
    })
  } catch (err) {
    console.error('[whatsapp-inbound] Chatwoot relay failed (non-fatal):', err)
  }
}

// ---------------------------------------------------------------------------
// HMAC verification (WAI-02)
// ---------------------------------------------------------------------------

function verifyHmac(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret || !signatureHeader) return false

  const expected =
    'sha256=' +
    createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')

  if (expected.length !== signatureHeader.length) return false

  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader),
  )
}

// ---------------------------------------------------------------------------
// WhatsApp free-text reply to rider (WAI-06, WAI-08)
// ---------------------------------------------------------------------------

async function replyToRider(
  senderPhone: string,
  text: string,
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: senderPhone,
        type: 'text',
        text: { body: text },
      }),
    },
  )
}

// ---------------------------------------------------------------------------
// Async processing — fire-and-forget (WAI-03 through WAI-08)
// ---------------------------------------------------------------------------

async function processAsync(payload: MetaWebhookPayload): Promise<void> {
  try {
    const value = payload.entry?.[0]?.changes?.[0]?.value
    const msgs = value?.messages ?? []

    // Silently ignore status-update payloads (Pitfall 3 in research)
    if (!msgs.length) return

    const message = msgs[0]
    const wamid = message.id
    const senderPhone = message.from // digits-only, no +
    const msgType = message.type

    // WAI-07: Allowlist check — silently ignore non-allowlisted senders
    const sb = createAdminSupabaseClient()
    const { data: allowRow } = await sb
      .from('whatsapp_rider_allowlist')
      .select('id')
      .eq('phone_digits', senderPhone)
      .eq('is_active', true)
      .maybeSingle()

    if (!allowRow) return // silently ignore — WAI-07

    // WAI-08: Non-text messages → reply with instructions
    if (msgType !== 'text') {
      try {
        await replyToRider(
          senderPhone,
          'Please send the dorm name as text (e.g. "Yugo" or "DSOA").',
        )
      } catch (err) {
        console.error('[whatsapp-inbound] reply failed (non-fatal):', err)
      }
      return
    }

    const msgText = message.text?.body ?? ''

    // WAI-04: Dedup — INSERT ON CONFLICT DO NOTHING
    const dedup = await sb
      .from('whatsapp_inbound_processed')
      .insert({
        message_id: wamid,
        sender_phone: senderPhone,
        raw_text: msgText.trim().toLowerCase(),
      })
      .select('id')

    // If 0 rows inserted the wamid was already processed — skip
    if (!dedup.data || dedup.data.length === 0) return

    // WAI-05, WAI-06: Fuzzy match
    const matchResult = matchDormName(msgText)

    // No match — no candidates
    if (matchResult.match === null && matchResult.candidates.length === 0) {
      try {
        await replyToRider(
          senderPhone,
          `Could not match "${msgText}" to a dorm. Try: The Myriad, KSK Homes, Yugo, DSOA Residence, Study World.`,
        )
      } catch (err) {
        console.error('[whatsapp-inbound] reply failed (non-fatal):', err)
      }
      return
    }

    // Ambiguous match (WAI-06) — reply "Did you mean X?"
    if (matchResult.match === null) {
      const options = matchResult.candidates.join(' or ')
      try {
        await replyToRider(
          senderPhone,
          `Did you mean: ${options}? Reply with the exact dorm name.`,
        )
      } catch (err) {
        console.error('[whatsapp-inbound] reply failed (non-fatal):', err)
      }
      return
    }

    // Clean match — confirm delivery
    const dormName = matchResult.match

    // Compute UAE date for this delivery
    const nowUAE = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const todayIso = nowUAE.toISOString().slice(0, 10)
    const isSaturday = nowUAE.getDay() === 6
    const dayName = nowUAE.toLocaleDateString('en-AE', {
      weekday: 'long',
      timeZone: 'Asia/Dubai',
    })

    // Look up expected count for this dorm today (used as rider count in WhatsApp path)
    const dormCounts = await getDormCounts(todayIso, dayName, isSaturday)
    const expectedCount = dormCounts[dormName] ?? 0

    // Update the delivery_events row (WAI-05 — confirm delivery via text)
    // riderCount = expectedCount (rider is asserting delivery happened)
    // geminiCount = null (no photo in this flow)
    const updateResult = await updateDeliveryEvent({
      deliveryDateIso: todayIso,
      dormName,
      tripNumber: 1,
      riderCount: expectedCount,
      geminiCount: null,
      geminiConfidence: null,
      photoPath: null,
      verified: true,
      geoLat: null,
      geoLng: null,
    })

    // Pitfall 5: No pickup row exists yet
    if (!updateResult.ok || updateResult.rowsAffected === 0) {
      try {
        await replyToRider(
          senderPhone,
          `No pickup confirmed for ${dormName} today — please use the ops link first, then text the dorm name.`,
        )
      } catch (err) {
        console.error('[whatsapp-inbound] reply failed (non-fatal):', err)
      }
      return
    }

    // Update dedup row with matched dorm for audit trail
    await sb
      .from('whatsapp_inbound_processed')
      .update({ matched_dorm: dormName })
      .eq('message_id', wamid)

    // Queue customer notification fanout (same as verify-box-count path)
    try {
      const fanout = await queueDeliveryConfirmedNotifications(
        dormName,
        todayIso,
        isSaturday,
      )
      console.log(
        `[whatsapp-inbound] fanout for ${dormName}: queued=${fanout.queued} skipped=${fanout.skipped}`,
      )
    } catch (err) {
      console.error(
        '[whatsapp-inbound] queueDeliveryConfirmedNotifications failed (non-fatal):',
        err,
      )
    }

    // Confirm to rider
    try {
      await replyToRider(
        senderPhone,
        `Delivery confirmed for ${dormName}. Customers notified.`,
      )
    } catch (err) {
      console.error(
        '[whatsapp-inbound] confirmation reply failed (non-fatal):',
        err,
      )
    }
  } catch (err) {
    // Top-level catch — processAsync must never throw (fire-and-forget)
    console.error('[whatsapp-inbound] processAsync error:', err)
  }
}
