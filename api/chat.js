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
        max_tokens: 512,
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
    ? `\n\n## WEBSITE CONTENT (scraped from ${gymUrl || 'their website'}):\n${gymContext.slice(0, 10000)}`
    : '';

  return `You are a friendly, knowledgeable AI assistant for ${gymName || 'this martial arts gym'}.

## YOUR ROLE:
- Answer questions from prospective members and existing students
- Be warm, enthusiastic, and encouraging about martial arts
- Keep responses concise (2-4 sentences unless more detail is clearly needed)
- Always steer people towards booking a trial class or getting in touch

## WHAT YOU KNOW:
You have been trained on this gym's website content. Use it to answer questions accurately.
If asked something you don't know, say "I'm not sure about that specific detail — I'd recommend contacting the gym directly" and suggest they visit the website or call.

## TONE:
- Friendly and conversational, not formal
- Enthusiastic about martial arts (BJJ, MMA, kickboxing, etc.)
- Never make up specific prices, times, or details not in the content below
- UK English spelling${contextSection}`;
}
