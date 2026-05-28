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
