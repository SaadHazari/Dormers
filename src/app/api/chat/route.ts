import { streamText, convertToModelMessages } from 'ai';
import { google } from '@ai-sdk/google';
import { NextResponse } from 'next/server';
import { DORMERS_KNOWLEDGE } from '@/contexts/chatbot/domain/knowledge';

export const maxDuration = 30;

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;

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

    // NOTE: per-IP/per-session rate limiting needs an external store (Upstash,
    // Vercel KV, or Supabase) to survive across serverless invocations. The
    // size caps above bound per-request cost but do not throttle frequency.

    try {
        const result = streamText({
            model: google('gemini-2.5-flash'),
            system: DORMERS_KNOWLEDGE,
            messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
    } catch {
        return NextResponse.json({ error: 'Chat service unavailable' }, { status: 502 });
    }
}
