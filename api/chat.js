// api/chat.js — Vercel Serverless Function
// POST /api/chat
// Body: { messages, gymContext, gymName, gymUrl }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, gymContext, gymName, gymUrl } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing messages array' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Build system prompt with scraped gym context
  const systemPrompt = buildSystemPrompt(gymName, gymUrl, gymContext);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: systemPrompt,
        messages: messages.slice(-10) // Keep last 10 messages for context window efficiency
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || "I'm not sure about that — please contact the gym directly.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ error: error.message || 'Chat failed' });
  }
}

function buildSystemPrompt(gymName, gymUrl, gymContext) {
  const contextSection = gymContext
    ? `\n\n## WEBSITE CONTENT:\n${gymContext.slice(0, 10000)}`
    : '';

  return `You are the AI assistant for ${gymName || 'this gym'}, chatting with someone who is ALREADY on the gym's website right now.

## CRITICAL RULES:
- Never tell someone to "visit the website" or "check the website" — they ARE on the website
- Never tell someone to "click the Book Now button on the website" — talk them through it conversationally instead
- Keep replies to 2-3 sentences max. Short and helpful.
- No bullet points, no bold text, no markdown formatting whatsoever
- Sound like a friendly human at the gym, not a robot
- If someone asks about a free trial, just confirm you offer one and ask what they'd like to know to get started — name, preferred day, that kind of thing
- If someone seems interested, gently move the conversation towards getting them booked in
- Only use information from the website content below — never invent prices, times or class names
- If you genuinely don't know something, say "I'd recommend giving us a call or dropping us a message and we can sort that for you"
- UK English only${contextSection}`;
}
