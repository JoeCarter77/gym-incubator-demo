export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  // Keywords that suggest a page has useful chatbot context
  const RELEVANT_KEYWORDS = [
    'price', 'pricing', 'cost', 'fee', 'membership', 'sign-up', 'signup', 'join',
    'timetable', 'schedule', 'class', 'classes', 'session', 'times',
    'about', 'contact', 'trial', 'free', 'intro', 'beginner'
  ];

  // Hard limit — never scrape more than this many extra pages
  const MAX_EXTRA_PAGES = 3;

  try {
    const baseUrl = new URL(url);

    // --- Helper: fetch a URL and return clean text ---
    async function fetchText(pageUrl) {
      try {
        const response = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GymIncubatorBot/1.0)' },
          redirect: 'follow',
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return '';
        const html = await response.text();
        return stripHtml(html);
      } catch {
        return '';
      }
    }

    // --- Helper: strip HTML to plain text ---
    function stripHtml(html) {
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 3000); // cap each page at 3000 chars
    }

    // --- Helper: extract internal nav links from homepage HTML ---
    function extractNavLinks(html, base) {
      const links = new Set();
      const hrefRegex = /href=["']([^"']+)["']/gi;
      let match;
      while ((match = hrefRegex.exec(html)) !== null) {
        try {
          const parsed = new URL(match[1], base);
          // Internal links only, no anchors, no files
          if (
            parsed.hostname === base.hostname &&
            parsed.pathname !== '/' &&
            parsed.pathname !== base.pathname &&
            !parsed.pathname.match(/\.(jpg|jpeg|png|gif|pdf|zip|css|js)$/i) &&
            !parsed.hash
          ) {
            links.add(parsed.href);
          }
        } catch {
          // skip invalid URLs
        }
      }
      return [...links];
    }

    // --- Helper: score a URL by how relevant it likely is ---
    function relevanceScore(pageUrl) {
      const lower = pageUrl.toLowerCase();
      let score = 0;
      for (const keyword of RELEVANT_KEYWORDS) {
        if (lower.includes(keyword)) score++;
      }
      return score;
    }

    // Step 1: Fetch homepage HTML (raw, before stripping — need links)
    const homepageResponse = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GymIncubatorBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000)
    });
    const homepageHtml = await homepageResponse.text();
    const homepageText = stripHtml(homepageHtml);

    // Step 2: Discover and rank internal links
    const allLinks = extractNavLinks(homepageHtml, baseUrl);
    const ranked = allLinks
      .map(link => ({ link, score: relevanceScore(link) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_EXTRA_PAGES)
      .map(({ link }) => link);

    // Step 3: Fetch all relevant pages in parallel
    const extraTexts = await Promise.all(ranked.map(fetchText));

    // Step 4: Combine into a single context string
    const sections = [
      `HOMEPAGE:\n${homepageText}`,
      ...ranked.map((link, i) => extraTexts[i]
        ? `PAGE (${new URL(link).pathname}):\n${extraTexts[i]}`
        : null
      ).filter(Boolean)
    ];

    const combinedText = sections.join('\n\n---\n\n');

    return res.status(200).json({ text: combinedText });

  } catch (error) {
    return res.status(500).json({ error: 'Scrape failed', detail: error.message });
  }
}
