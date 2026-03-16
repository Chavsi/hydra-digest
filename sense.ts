// HYDRA SENSE — Cabeza 1: GitHub Trending + Hacker News
// Cron: runs daily, emails you a digest
// En Val Town: Create new Val → HTTP type → paste this → then set up Cron

import { email } from "https://esm.town/v/std/email";

// ============================================
// 1. FETCH GITHUB TRENDING (scrape approach)
// ============================================
async function getGitHubTrending() {
  const results = [];

  // GitHub Trending no tiene API oficial, pero podemos usar
  // la API de search con filtro de fecha
  const since = new Date();
  since.setDate(since.getDate() - 7); // últimos 7 días
  const dateStr = since.toISOString().split("T")[0];

  // Buscar repos creados recientemente con muchas estrellas
  const queries = [
    `created:>${dateStr} stars:>50 language:python`,
    `created:>${dateStr} stars:>50 language:typescript`,
    `created:>${dateStr} stars:>50 language:javascript`,
    `created:>${dateStr} stars:>30 topic:ai`,
    `created:>${dateStr} stars:>30 topic:automation`,
  ];

  for (const q of queries) {
    try {
      const resp = await fetch(
        `https://api.github.com/search/repositories?q=${
          encodeURIComponent(q)
        }&sort=stars&order=desc&per_page=5`,
        {
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "HYDRA-Sense/1.0",
          },
        },
      );

      if (resp.ok) {
        const data = await resp.json();
        for (const repo of (data.items || [])) {
          // Evitar duplicados
          if (!results.find((r) => r.url === repo.html_url)) {
            results.push({
              name: repo.full_name,
              url: repo.html_url,
              description: repo.description || "Sin descripción",
              stars: repo.stargazers_count,
              language: repo.language || "N/A",
              created: repo.created_at?.split("T")[0],
              topics: (repo.topics || []).slice(0, 5).join(", "),
            });
          }
        }
      }

      // Rate limit: esperar 1 segundo entre requests
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Error fetching GitHub: ${e.message}`);
    }
  }

  // Ordenar por estrellas, top 15
  return results
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 15);
}

// ============================================
// 2. FETCH HACKER NEWS — Top stories
// ============================================
async function getHackerNewsTop() {
  const results = [];

  try {
    // HN API: top stories IDs
    const resp = await fetch(
      "https://hacker-news.firebaseio.com/v0/beststories.json",
    );
    const ids = await resp.json();

    // Tomar los primeros 20
    const topIds = ids.slice(0, 20);

    for (const id of topIds) {
      try {
        const storyResp = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        );
        const story = await storyResp.json();

        if (story && story.type === "story") {
          results.push({
            title: story.title,
            url: story.url ||
              `https://news.ycombinator.com/item?id=${story.id}`,
            hn_url: `https://news.ycombinator.com/item?id=${story.id}`,
            score: story.score,
            comments: story.descendants || 0,
          });
        }
      } catch (e) {
        // skip individual failures
      }
    }
  } catch (e) {
    console.error(`Error fetching HN: ${e.message}`);
  }

  return results;
}

// ============================================
// 3. FILTRO INTELIGENTE — Keywords de interés
// ============================================
function scoreRelevance(text) {
  const keywords = {
    high: [
      "automation",
      "browser-use",
      "agent",
      "mcp",
      "scraping",
      "serverless",
      "cloudflare",
      "deno",
      "val-town",
      "self-hosted",
      "open-source",
      "framework",
      "saas",
      "ai-agent",
      "llm",
      "flask",
      "python",
      "web-app",
      "deploy",
      "free",
      "bounty",
      "grant",
      "indie",
      "solo-dev",
      "bootstrap",
    ],
    medium: [
      "api",
      "tool",
      "cli",
      "database",
      "realtime",
      "typescript",
      "javascript",
      "rust",
      "security",
      "hack",
      "startup",
      "revenue",
      "monetize",
      "pattern",
      "analysis",
    ],
  };

  const lower = text.toLowerCase();
  let score = 0;

  for (const kw of keywords.high) {
    if (lower.includes(kw)) score += 3;
  }
  for (const kw of keywords.medium) {
    if (lower.includes(kw)) score += 1;
  }

  return score;
}

// ============================================
// 4. BUILD EMAIL DIGEST
// ============================================
function buildDigest(ghRepos, hnStories) {
  const now = new Date().toLocaleDateString("es-EC", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Score y ordenar repos por relevancia
  const scoredRepos = ghRepos.map((r) => ({
    ...r,
    relevance: scoreRelevance(`${r.name} ${r.description} ${r.topics}`),
  })).sort((a, b) => b.relevance - a.relevance);

  // Score y ordenar HN stories
  const scoredHN = hnStories.map((s) => ({
    ...s,
    relevance: scoreRelevance(s.title),
  })).sort((a, b) => b.relevance - a.relevance);

  // Separar en categorías
  const hotRepos = scoredRepos.filter((r) => r.relevance >= 3);
  const otherRepos = scoredRepos.filter((r) => r.relevance < 3).slice(0, 5);
  const hotHN = scoredHN.filter((s) => s.relevance >= 2);
  const otherHN = scoredHN.filter((s) => s.relevance < 2).slice(0, 5);

  let html = `
    <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; max-width: 700px; margin: 0 auto; background: #0a0a0f; color: #e0e0e0; padding: 2rem;">
      
      <div style="border-bottom: 2px solid #00ff88; padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <h1 style="color: #00ff88; font-size: 1.5rem; margin: 0;">◉ HYDRA DIGEST</h1>
        <p style="color: #666; font-size: 0.8rem; margin: 0.25rem 0 0;">${now}</p>
      </div>
  `;

  // === HOT REPOS ===
  if (hotRepos.length > 0) {
    html += `
      <div style="margin-bottom: 1.5rem;">
        <h2 style="color: #ff6b00; font-size: 1rem; border-left: 3px solid #ff6b00; padding-left: 0.75rem;">
          🔥 GitHub — Alta relevancia (${hotRepos.length})
        </h2>
    `;

    for (const r of hotRepos) {
      html += `
        <div style="background: #111118; border: 1px solid #1a1a25; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;">
          <div>
            <a href="${r.url}" style="color: #00ff88; text-decoration: none; font-weight: bold; font-size: 0.85rem;">
              ${r.name}
            </a>
            <span style="color: #ff6b00; font-size: 0.7rem; margin-left: 0.5rem;">
              ⭐ ${r.stars} · ${r.language}
            </span>
          </div>
          <p style="color: #999; font-size: 0.75rem; margin: 0.3rem 0 0; line-height: 1.4;">
            ${r.description}
          </p>
          ${
        r.topics
          ? `<p style="color: #555; font-size: 0.65rem; margin: 0.3rem 0 0;">Tags: ${r.topics}</p>`
          : ""
      }
        </div>
      `;
    }
    html += `</div>`;
  }

  // === HOT HN ===
  if (hotHN.length > 0) {
    html += `
      <div style="margin-bottom: 1.5rem;">
        <h2 style="color: #ff0055; font-size: 1rem; border-left: 3px solid #ff0055; padding-left: 0.75rem;">
          🧠 Hacker News — Relevante (${hotHN.length})
        </h2>
    `;

    for (const s of hotHN) {
      html += `
        <div style="background: #111118; border: 1px solid #1a1a25; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;">
          <a href="${s.url}" style="color: #e0e0e0; text-decoration: none; font-size: 0.85rem; font-weight: bold;">
            ${s.title}
          </a>
          <div style="margin-top: 0.3rem;">
            <span style="color: #ff0055; font-size: 0.7rem;">▲ ${s.score} points</span>
            <a href="${s.hn_url}" style="color: #666; font-size: 0.7rem; margin-left: 0.5rem; text-decoration: none;">
              💬 ${s.comments} comments
            </a>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }

  // === OTHER REPOS ===
  if (otherRepos.length > 0) {
    html += `
      <div style="margin-bottom: 1.5rem;">
        <h2 style="color: #555; font-size: 0.85rem; border-left: 3px solid #333; padding-left: 0.75rem;">
          📡 GitHub — Otros notables
        </h2>
    `;

    for (const r of otherRepos) {
      html += `
        <div style="padding: 0.4rem 0; border-bottom: 1px solid #111;">
          <a href="${r.url}" style="color: #888; text-decoration: none; font-size: 0.8rem;">
            ${r.name}
          </a>
          <span style="color: #444; font-size: 0.65rem;"> — ⭐ ${r.stars} · ${r.language}</span>
        </div>
      `;
    }
    html += `</div>`;
  }

  // === OTHER HN ===
  if (otherHN.length > 0) {
    html += `
      <div style="margin-bottom: 1.5rem;">
        <h2 style="color: #555; font-size: 0.85rem; border-left: 3px solid #333; padding-left: 0.75rem;">
          📰 HN — Otros
        </h2>
    `;

    for (const s of otherHN) {
      html += `
        <div style="padding: 0.4rem 0; border-bottom: 1px solid #111;">
          <a href="${s.url}" style="color: #888; text-decoration: none; font-size: 0.8rem;">
            ${s.title}
          </a>
          <span style="color: #444; font-size: 0.65rem;"> — ▲ ${s.score}</span>
        </div>
      `;
    }
    html += `</div>`;
  }

  // Footer
  html += `
      <div style="border-top: 1px solid #1a1a25; padding-top: 1rem; margin-top: 1rem;">
        <p style="color: #333; font-size: 0.65rem; text-align: center;">
          HYDRA SENSE v0.1 — CompuMás Labs — Autónomo 24/7
        </p>
      </div>
    </div>
  `;

  return {
    html,
    stats: {
      totalRepos: ghRepos.length,
      hotRepos: hotRepos.length,
      totalHN: hnStories.length,
      hotHN: hotHN.length,
    },
  };
}

// ============================================
// 5. MAIN — Entry point
// ============================================
export default async function handler(req: Request): Promise<Response> {
  console.log("🐍 HYDRA SENSE — Starting scan...");

  // Fetch data
  const [ghRepos, hnStories] = await Promise.all([
    getGitHubTrending(),
    getHackerNewsTop(),
  ]);

  console.log(
    `📡 Found ${ghRepos.length} repos, ${hnStories.length} HN stories`,
  );

  // Build digest
  const digest = buildDigest(ghRepos, hnStories);

  // Send email (Val Town sends to YOUR email automatically)
  await email({
    subject:
      `◉ HYDRA — ${digest.stats.hotRepos} repos 🔥 ${digest.stats.hotHN} HN hot — ${
        new Date().toLocaleDateString("es-EC")
      }`,
    html: digest.html,
  });

  console.log("📧 Digest sent!");

  // Return summary (for HTTP testing)
  return new Response(
    JSON.stringify({
      status: "ok",
      sent: new Date().toISOString(),
      stats: digest.stats,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
