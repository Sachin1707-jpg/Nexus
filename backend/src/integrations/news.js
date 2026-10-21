import { config } from '../config.js';

export async function getLatestNews({ category, query } = {}) {
  const apiKey = config.NEWS_API_KEY || process.env.NEWS_API_KEY;

  if (apiKey) {
    try {
      const endpoint = query
        ? `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=5&apikey=${apiKey}`
        : `https://gnews.io/api/v4/top-headlines?category=${category || 'general'}&lang=en&max=5&apikey=${apiKey}`;

      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'nexus-assistant' },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        const articles = (data.articles || []).slice(0, 5);
        if (articles.length > 0) {
          return {
            source: 'GNews',
            articles: articles.map((a) => ({
              title: a.title,
              description: a.description || 'No description available',
              url: a.url,
              publishedAt: a.publishedAt,
            })),
          };
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Live fallback to HackerNews top tech stories if NEWS_API_KEY is not yet configured or rate-limited
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const ids = (await res.json()).slice(0, 5);
      const stories = await Promise.all(
        ids.map((id) =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(4000) })
            .then((r) => r.json())
            .catch(() => null)
        )
      );
      const valid = stories.filter(Boolean);
      return {
        source: 'Live Tech Headlines',
        note: apiKey ? undefined : 'Using live tech feed. Set NEWS_API_KEY in .env for custom categories and GNews search.',
        articles: valid.map((s) => ({
          title: s.title,
          description: `Score: ${s.score || 0} points, by ${s.by || 'author'}`,
          url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        })),
      };
    }
  } catch {}

  return {
    source: 'Unavailable',
    articles: [],
    message: 'Could not fetch news. Add NEWS_API_KEY from https://gnews.io in your .env file to enable custom news searches.',
  };
}
