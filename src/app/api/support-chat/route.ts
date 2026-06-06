import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { NextResponse } from 'next/server';
import { DORMERS_SUPPORT_KNOWLEDGE } from '@/contexts/chatbot/domain/support-knowledge';

export const maxDuration = 30;

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;

function normalizeMessages(raw: Record<string, unknown>[]): UIMessage[] {
    return raw.map((m) => ({
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

    const bodyObj = body as { messages?: unknown; customerContext?: string }
    const customerContext = typeof bodyObj.customerContext === 'string' ? bodyObj.customerContext : ''
    const messages = bodyObj.messages;
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
        console.error('[support-chat] GOOGLE_GENERATIVE_AI_API_KEY is not set');
        return NextResponse.json({ error: 'Chat service not configured' }, { status: 503 });
    }

    try {
        const normalized = normalizeMessages(messages as Record<string, unknown>[])
        const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
        const aeTime = `${aeNow.getUTCHours()}:${String(aeNow.getUTCMinutes()).padStart(2, '0')}`
        const aeDow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][aeNow.getUTCDay()]
        const aeDate = `${aeNow.getUTCFullYear()}-${String(aeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(aeNow.getUTCDate()).padStart(2, '0')}`
        const timeContext = `\n\n# RIGHT NOW\nCurrent Dubai time: ${aeTime} on ${aeDow}, ${aeDate}. Use this to determine if the skip cutoff (2 PM) has passed, whether today is a delivery day, etc.`
        const system = customerContext
            ? `${DORMERS_SUPPORT_KNOWLEDGE}${timeContext}\n\n${customerContext}\n\nUse this customer data to answer questions about THEIR plan directly instead of escalating. Only escalate account-specific ACTIONS (refunds, payment failures, missing meals) — not account-specific QUESTIONS you can now answer from the data above.`
            : `${DORMERS_SUPPORT_KNOWLEDGE}${timeContext}`
        const result = streamText({
            model: google('gemini-3.1-flash-lite'),
            system,
            messages: await convertToModelMessages(normalized),
        });
        return result.toUIMessageStreamResponse();
    } catch (err) {
        console.error('[support-chat] stream error:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Chat service unavailable' }, { status: 502 });
    }
}
