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
        max_tokens: 150,
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

  return `You are a friendly AI assistant for ${gymName || 'this martial arts gym'}.

## RULES:
- Keep EVERY reply to 2-3 short sentences maximum. Never more.
- Be direct and concise — no waffle, no long explanations
- If they want more detail, they'll ask
- Never use bullet points or bold text
- Always end by nudging them to book a trial or contact the gym
- If you don't know something specific, say "Best to contact the gym directly for that one!"
- UK English${contextSection}`;
}
