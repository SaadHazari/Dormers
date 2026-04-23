import { streamText, convertToModelMessages } from 'ai';
import { google } from '@ai-sdk/google';
import { DORMERS_KNOWLEDGE } from '@/lib/chatbot-knowledge';

export const maxDuration = 30;

export async function POST(req: Request) {
    const body = await req.json();
    console.log("Incoming Body:", JSON.stringify(body, null, 2));
    const { messages } = body;

    const result = streamText({
        model: google('gemini-2.5-flash'),
        system: DORMERS_KNOWLEDGE,
        messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
}