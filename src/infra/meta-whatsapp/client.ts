// Meta WhatsApp Cloud API — minimal client, server-only.
// All env reads happen at call time so missing config fails loudly with a
// useful message rather than at module import.

import { fetchWithTimeout } from '@/infra/http/fetch-with-timeout'

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

// Send the approved authentication template with a 6-digit code.
// `phoneE164` is the canonical "+971504619384" form we store in the DB; the
// Cloud API requires the leading "+" stripped, so do it here.
export async function sendOtpTemplate(phoneE164: string, code: string): Promise<void> {
    const phoneNumberId = env('WHATSAPP_PHONE_NUMBER_ID')
    const token         = env('WHATSAPP_ACCESS_TOKEN')
    const templateName  = env('WHATSAPP_OTP_TEMPLATE_NAME')

    const to  = phoneE164.replace(/^\+/, '')
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`

    // Authentication template structure: body parameter for the message text,
    // button parameter for the COPY_CODE button. Both receive the same code.
    const payload = {
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
    }

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
        // without digging through Netlify logs.
        const errBody = await res.text()
        throw new Error(`WhatsApp send failed (${res.status}): ${errBody}`)
    }
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
    const phoneNumberId = env('WHATSAPP_PHONE_NUMBER_ID')
    const token         = env('WHATSAPP_ACCESS_TOKEN')
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`

    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template }),
    }, { timeoutMs: SEND_TIMEOUT_MS })

    if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`WhatsApp send failed (${res.status}): ${errBody}`)
    }
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
