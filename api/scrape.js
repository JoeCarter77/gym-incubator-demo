// api/scrape.js — Vercel Serverless Function
// GET /api/scrape?url=https://royaljiujitsu.co.uk

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    // Fetch the main page
    const mainContent = await fetchPage(url);

    // Try to also fetch common subpages for richer context
    const subpages = ['/classes', '/pricing', '/about', '/contact', '/schedule', '/coaches', '/instructors', '/membership'];
    const subpageContents = await Promise.allSettled(
      subpages.map(path => fetchPage(`${parsedUrl.origin}${path}`))
    );

    const allContent = [mainContent];
    subpageContents.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        allContent.push(result.value);
      }
    });

    // Combine and trim
    const combined = allContent
      .filter(Boolean)
      .join('\n\n--- PAGE BREAK ---\n\n')
      .slice(0, 12000); // Keep context reasonable

    return res.status(200).json({
      content: combined,
      url,
      pagesScraped: allContent.length
    });

  } catch (error) {
    console.error('Scrape error:', error);
    return res.status(500).json({ error: error.message || 'Failed to scrape URL' });
  }
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GymBot/1.0; +https://dojo.ai)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      }
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();
    return extractText(html, url);

  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function extractText(html, url) {
  // Remove scripts, styles, comments, and other non-content elements
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')   // Strip remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')    // Collapse whitespace
    .trim();

  // Add source URL as context
  return `[SOURCE: ${url}]\n${text}`;
}
