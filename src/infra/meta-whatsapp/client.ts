// Meta WhatsApp Cloud API — minimal client, server-only.
// All env reads happen at call time so missing config fails loudly with a
// useful message rather than at module import.

import { fetchWithTimeout } from '@/infra/http/fetch-with-timeout'
import { getCircuitBreaker } from '@/infra/http/circuit-breaker'

const GRAPH_VERSION = 'v22.0' // matches the version used in the Make scenario

// User is staring at the OTP screen waiting for the code to arrive. If Meta
// takes longer than this we'd rather throw and let the customer retry than
// hang the route handler.
const SEND_TIMEOUT_MS = 8_000

function env(key: string): string {
    const v = process.env[key]
    if (!v) throw new Error(`Missing env var: ${key}`)
    return v
}

// Release It! L4: a process-shared circuit breaker for the Meta Graph API.
// Meta is the most outage-prone dependency here (rate limits + the documented
// template-rejection regressions) and OTP send is on the acquisition hot path.
// After 5 consecutive failures the breaker opens and subsequent sends fail FAST
// (CircuitOpenError) for 30s instead of each blocking for the full 8s timeout —
// shedding load during an outage instead of amplifying it. Callers already
// treat a throw as "send failed" (OTP /start returns 502), so the customer gets
// a fast, retryable result rather than a hung request. NOT retried: a WhatsApp
// send is not idempotent (each call costs money + delivers a message).
const META_BREAKER = { failureThreshold: 5, recoveryTimeMs: 30_000 }

async function graphPost(payload: Record<string, unknown>): Promise<void> {
    const phoneNumberId = env('WHATSAPP_PHONE_NUMBER_ID')
    const token         = env('WHATSAPP_ACCESS_TOKEN')
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`

    await getCircuitBreaker('meta-whatsapp', META_BREAKER).run(async () => {
        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        }, { timeoutMs: SEND_TIMEOUT_MS })

        if (!res.ok) {
            // Surface the Meta error so we can debug template/permission issues
            // without digging through Netlify logs. Counts as a breaker failure.
            const errBody = await res.text()
            throw new Error(`WhatsApp send failed (${res.status}): ${errBody}`)
        }
    })
}

// Send the approved authentication template with a 6-digit code.
// `phoneE164` is the canonical "+971504619384" form we store in the DB; the
// Cloud API requires the leading "+" stripped, so do it here.
export async function sendOtpTemplate(phoneE164: string, code: string): Promise<void> {
    const templateName = env('WHATSAPP_OTP_TEMPLATE_NAME')
    const to = phoneE164.replace(/^\+/, '')

    // Authentication template structure: body parameter for the message text,
    // button parameter for the COPY_CODE button. Both receive the same code.
    await graphPost({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: 'en' },
            components: [
                {
                    type: 'body',
                    parameters: [{ type: 'text', text: code }],
                },
                {
                    type: 'button',
                    sub_type: 'url',
                    index: 0,
                    parameters: [{ type: 'text', text: code }],
                },
            ],
        },
    })
}

// ── Staff invite — TWO messages, fired on command from /admin/staff ─────────
//
// Meta classifies any template carrying a one-time code as AUTHENTICATION,
// and auth templates can't carry marketing/utility content (welcome copy,
// redirect buttons). So the invite is split:
//   1. `staff_invite_code` (AUTH)    — the claim code, fixed Meta auth format
//      (positional {{1}} + copy-code button), exactly like the OTP template.
//   2. `staff_invite`      (UTILITY) — the welcome + "Claim your Meals" URL
//      button. Header named param `first_name`, NO code vocabulary in the
//      body (that's what got the first submission rejected:
//      INCORRECT_CATEGORY).
//
// The code message is the essential one — if it fails, the whole send
// throws. The welcome message is best-effort: its failure (e.g. template
// still in review) is reported back, not thrown, so the admin knows the
// code DID land.

async function postTemplate(to: string, template: unknown): Promise<void> {
    await graphPost({ messaging_product: 'whatsapp', to, type: 'template', template })
}

// ── Ops access link — sent to a rider or kitchen lead from /admin/ops-tokens ─
//
// UTILITY template with a DYNAMIC url button. The button's base URL is
// configured in Business Manager as `https://dormers.ae/{{1}}` and we pass the
// path suffix ("ops/<token>" or "kitchen/<token>") as that variable — Meta
// appends it. This is the piece that differs from the admin-alert template,
// which was built with a STATIC button and therefore 132018'd the moment code
// tried to send button parameters. If this template is ever recreated, it must
// keep the trailing {{1}} or this call breaks the same way.
//
// Body uses NAMED parameters, so each one carries `parameter_name`. Meta is
// strict here: a template authored with named variables rejects positional
// parameters outright.
//
// Throws on failure. The caller is expected to catch and offer the wa.me
// fallback rather than leave the admin with nothing.

export async function sendOpsLinkWhatsApp(
    phone: string,
    recipientName: string,
    linkName: string,
    linkPath: string,
): Promise<void> {
    const templateName = process.env.WHATSAPP_OPS_LINK_TEMPLATE_NAME ?? 'ops_access_link'
    // Locale must match Business Manager exactly — "English" is `en`, not
    // `en_US`, and Meta 404s ("template does not exist in <lang>") on a miss.
    const language = process.env.WHATSAPP_OPS_LINK_TEMPLATE_LANG ?? 'en'
    const to = phone.replace(/\D/g, '').replace(/^00/, '')

    await postTemplate(to, {
        name: templateName,
        language: { code: language },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', parameter_name: 'name', text: recipientName },
                    { type: 'text', parameter_name: 'link_name', text: linkName },
                ],
            },
            {
                type: 'button',
                sub_type: 'url',
                index: 0,
                // Suffix only — Business Manager holds the https://dormers.ae/ base.
                parameters: [{ type: 'text', text: linkPath }],
            },
        ],
    })
}

export async function sendStaffInviteWhatsApp(
    phoneE164: string,
    firstName: string,
    claimCode: string,
): Promise<{ welcomeSent: boolean; welcomeError?: string }> {
    const codeTemplate    = process.env.WHATSAPP_STAFF_INVITE_CODE_TEMPLATE_NAME ?? 'staff_invite_code'
    const welcomeTemplate = process.env.WHATSAPP_STAFF_INVITE_TEMPLATE_NAME ?? 'staff_invite'
    const to = phoneE164.replace(/^\+/, '')

    // 1. The code — Meta auth-template format: positional body param + the
    //    copy-code URL button, both carrying the code.
    await postTemplate(to, {
        name: codeTemplate,
        language: { code: 'en' },
        components: [
            { type: 'body', parameters: [{ type: 'text', text: claimCode }] },
            { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: claimCode }] },
        ],
    })

    // 2. The welcome + claim button — best-effort while the utility template
    //    is in review; the code above already landed.
    //    NOTE the locale split: the resubmitted welcome template was created
    //    as English (UAE) = 'en_AE', while the code template is plain 'en'.
    //    Meta 404s on a locale mismatch (template "does not exist in en"),
    //    so these must each match their Business Manager language exactly.
    try {
        await postTemplate(to, {
            name: welcomeTemplate,
            language: { code: 'en_AE' },
            components: [
                { type: 'header', parameters: [{ type: 'text', parameter_name: 'first_name', text: firstName }] },
            ],
        })
        return { welcomeSent: true }
    } catch (err) {
        return { welcomeSent: false, welcomeError: err instanceof Error ? err.message : 'send failed' }
    }
}
