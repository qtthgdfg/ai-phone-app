// src/services/search.ts
// Web search via Brave Search API (free tier: 2000 req/month)
// Sign up at: https://api.search.brave.com/

import { SearchResult } from "../types";

const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";

export async function webSearch(
  query: string,
  apiKey: string,
  numResults: number = 5
): Promise<SearchResult[]> {
  if (!apiKey) {
    return fallbackSearch(query);
  }

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(numResults, 20)),
      search_lang: "en",
      safesearch: "moderate",
      freshness: "pw",   // past week for recent results
    });

    const response = await fetch(`${BRAVE_URL}?${params}`, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) throw new Error(`Search API ${response.status}`);

    const data = await response.json();
    const results: SearchResult[] = [];

    for (const r of data.web?.results || []) {
      results.push({
        title: r.title,
        url: r.url,
        snippet: r.description || "",
        published: r.age,
      });
    }

    // Also add news results if available
    for (const r of (data.news?.results || []).slice(0, 2)) {
      results.push({
        title: r.title,
        url: r.url,
        snippet: r.description || "",
        published: r.age,
      });
    }

    return results.slice(0, numResults);
  } catch (err) {
    console.error("Search error:", err);
    return fallbackSearch(query);
  }
}

// Fallback: DuckDuckGo instant answers (no API key needed, limited)
async function fallbackSearch(query: string): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      no_redirect: "1",
      no_html: "1",
    });

    const response = await fetch(
      `https://api.duckduckgo.com/?${params}`,
      { headers: { "Accept": "application/json" } }
    );

    const data = await response.json();
    const results: SearchResult[] = [];

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || "",
        snippet: data.AbstractText,
      });
    }

    for (const topic of (data.RelatedTopics || []).slice(0, 4)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 60),
          url: topic.FirstURL,
          snippet: topic.Text,
        });
      }
    }

    return results;
  } catch {
    return [
      {
        title: "Search unavailable",
        url: "",
        snippet: "No search API key configured. Add a Brave Search API key in Settings.",
      },
    ];
  }
}

// Format search results for Claude
export function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return "No results found.";

  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}${r.published ? `\nPublished: ${r.published}` : ""}`
    )
    .join("\n\n");
}
