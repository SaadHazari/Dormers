import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { NextResponse } from 'next/server';
import { getDormersKnowledge } from '@/contexts/chatbot/domain/knowledge';
import { getDormLocations } from '@/infra/supabase/dorm-locations';
import { chatLimiter, ipKey } from '@/infra/rate-limit/limiters';
import { isFeatureEnabled } from '@/infra/config/feature-flags';
import { captureError } from '@/infra/logging/capture-error';

export const maxDuration = 30;

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;

function normalizeMessages(raw: Record<string, unknown>[]): UIMessage[] {
    // Whitelist roles. The role is client-supplied; without this filter a caller
    // could forge `system`/`assistant` turns to steer the model (prompt injection).
    return raw
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
            id: (m.id as string) ?? crypto.randomUUID(),
            role: m.role as 'user' | 'assistant',
            parts: Array.isArray(m.parts)
                ? m.parts
                : typeof m.content === 'string'
                    ? [{ type: 'text' as const, text: m.content }]
                    : [{ type: 'text' as const, text: '' }],
        })) as UIMessage[]
}

export async function POST(req: Request) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null) {
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const messages = (body as { messages?: unknown }).messages;
    if (!Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 });
    }
    if (messages.length > MAX_MESSAGES) {
        return NextResponse.json({ error: `messages exceeds ${MAX_MESSAGES}` }, { status: 400 });
    }
    for (const m of messages) {
        if (JSON.stringify(m).length > MAX_MESSAGE_CHARS) {
            return NextResponse.json({ error: 'Message content too long' }, { status: 400 });
        }
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error('[chat] GOOGLE_GENERATIVE_AI_API_KEY is not set');
        return NextResponse.json({ error: 'Chat service not configured' }, { status: 503 });
    }

    // Phase 8 (L7): instant kill-switch — pause chat (e.g. runaway Gemini spend)
    // without a redeploy. 503 → the widget's onError shows the WhatsApp fallback.
    // Fails open (stays on) if the flag read fails.
    if (!(await isFeatureEnabled('chat'))) {
        return NextResponse.json({ error: 'chat_paused' }, { status: 503 });
    }

    // Rate-limit (L3, enforcing): 60/min/IP (dorm-NAT-safe), fails open. On block
    // return 503 → the widget's onError shows the WhatsApp fallback, not a dead end.
    const chatRl = await chatLimiter.check(await ipKey('chat'));
    if (!chatRl.allowed) {
        return NextResponse.json({ error: 'rate_limited' }, { status: 503 });
    }

    try {
        const normalized = normalizeMessages(messages as Record<string, unknown>[])
        const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
        const aeTime = `${aeNow.getUTCHours()}:${String(aeNow.getUTCMinutes()).padStart(2, '0')}`
        const aeDow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][aeNow.getUTCDay()]
        const aeDate = `${aeNow.getUTCFullYear()}-${String(aeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(aeNow.getUTCDate()).padStart(2, '0')}`
        const locs = await getDormLocations()
        const knowledge = getDormersKnowledge(locs)
        const system = `${knowledge}\n\n# RIGHT NOW\nCurrent Dubai time: ${aeTime} on ${aeDow}, ${aeDate}. Use this to determine if the skip cutoff (2 PM) has passed, whether today is a delivery day, etc.`
        const result = streamText({
            model: google('gemini-3.1-flash-lite'),
            system,
            messages: await convertToModelMessages(normalized),
            // Release It! L4: bound the call so a stalled Gemini fails fast (inside
            // the 30s function budget) instead of hanging; retry transient blips.
            // A failure surfaces to the widget's onError → WhatsApp fallback.
            abortSignal: AbortSignal.timeout(25_000),
            maxRetries: 2,
        });
        return result.toUIMessageStreamResponse();
    } catch (err) {
        captureError(err, { area: 'ai', op: 'chat.stream' });
        return NextResponse.json({ error: 'Chat service unavailable' }, { status: 502 });
    }
}
