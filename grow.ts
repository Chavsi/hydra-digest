// =============================================
// HYDRA v0.3 — SENSE + THINK + GROW
// Auto-genera artículos estilo Patternator
// Cron: 1x/día — $0 costo
// =============================================

import { email } from "https://esm.town/v/std/email";

// ============================================
// SENSE — Recolectar datos
// ============================================

async function getGitHubTrending() {
  const results = [];
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const dateStr = since.toISOString().split("T")[0];

  const queries = [
    `created:>${dateStr} stars:>50 language:python`,
    `created:>${dateStr} stars:>50 language:typescript`,
    `created:>${dateStr} stars:>50 language:javascript`,
    `created:>${dateStr} stars:>30 topic:ai`,
    `created:>${dateStr} stars:>30 topic:automation`,
    `created:>${dateStr} stars:>20 topic:open-source`,
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
            "User-Agent": "HYDRA/0.3",
          },
        },
      );
      if (resp.ok) {
        const data = await resp.json();
        for (const repo of (data.items || [])) {
          if (!results.find((r) => r.url === repo.html_url)) {
            results.push({
              name: repo.full_name,
              url: repo.html_url,
              description: repo.description || "",
              stars: repo.stargazers_count,
              language: repo.language || "N/A",
              created: repo.created_at?.split("T")[0],
              topics: (repo.topics || []).join(", "),
            });
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.error(`GH error: ${e.message}`);
    }
  }
  return results.sort((a, b) => b.stars - a.stars).slice(0, 20);
}

async function getHackerNewsTop() {
  const results = [];
  try {
    const resp = await fetch(
      "https://hacker-news.firebaseio.com/v0/beststories.json",
    );
    const ids = await resp.json();
    for (const id of ids.slice(0, 25)) {
      try {
        const r = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        );
        const story = await r.json();
        if (story?.type === "story") {
          results.push({
            title: story.title,
            url: story.url ||
              `https://news.ycombinator.com/item?id=${story.id}`,
            hn_url: `https://news.ycombinator.com/item?id=${story.id}`,
            score: story.score,
            comments: story.descendants || 0,
          });
        }
      } catch (_) {}
    }
  } catch (e) {
    console.error(`HN error: ${e.message}`);
  }
  return results;
}

// ============================================
// THINK — Análisis
// ============================================

const CATEGORIES = {
  "AI/Agents": [
    "agent",
    "llm",
    "gpt",
    "claude",
    "openai",
    "anthropic",
    "langchain",
    "embedding",
    "rag",
    "mcp",
    "browser-use",
    "computer-use",
  ],
  "Automation": [
    "automat",
    "cron",
    "scraper",
    "crawler",
    "bot",
    "workflow",
    "pipeline",
    "webhook",
    "n8n",
  ],
  "Web/Deploy": [
    "serverless",
    "cloudflare",
    "vercel",
    "deno",
    "val-town",
    "edge",
    "deploy",
    "docker",
    "container",
    "framework",
    "htmx",
    "hono",
  ],
  "Opportunity": [
    "bounty",
    "grant",
    "funding",
    "sponsor",
    "paid",
    "freelance",
    "contract",
    "saas",
    "monetize",
    "indie",
  ],
  "Security": ["security", "vuln", "exploit", "pentest", "auth", "encrypt"],
  "Python": ["python", "flask", "django", "fastapi", "gunicorn"],
  "Data": ["database", "analytics", "dashboard", "postgres", "sqlite", "redis"],
};

function detectCategories(text) {
  const lower = text.toLowerCase();
  const matched = [];
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw))) matched.push(cat);
  }
  return matched.length ? matched : ["General"];
}

function scoreItem(item, source) {
  const text = (item.name || item.title || "") + " " +
    (item.description || "") + " " + (item.topics || "");
  const lower = text.toLowerCase();
  let score = 0;
  const tags = [];

  if (source === "gh" && item.created) {
    const days = Math.max(
      1,
      (Date.now() - new Date(item.created).getTime()) / 86400000,
    );
    const vel = item.stars / days;
    if (vel > 100) {
      score += 10;
      tags.push("VIRAL");
    } else if (vel > 30) {
      score += 7;
      tags.push("HOT");
    } else if (vel > 10) {
      score += 4;
      tags.push("Rising");
    }
  }

  if (source === "hn") {
    if (item.score > 500) {
      score += 8;
      tags.push("HN Fire");
    } else if (item.score > 200) {
      score += 5;
      tags.push("HN Hot");
    } else if (item.score > 100) score += 3;
  }

  if (/bounty|grant|paid|hire|contract|freelance/.test(lower)) {
    score += 5;
    tags.push("MONEY");
  }
  if (/python|flask|open.?source|self.?hosted/.test(lower)) {
    score += 3;
    tags.push("YOUR_STACK");
  }
  if (/scraper|monitor|cron|automation|browser|agent/.test(lower)) {
    score += 2;
    tags.push("HYDRA_FUEL");
  }

  return { score, tags, categories: detectCategories(text) };
}

function analyzeAll(ghRepos, hnStories) {
  const analyzed = [
    ...ghRepos.map((r) => ({
      ...r,
      ...scoreItem(r, "gh"),
      source: "gh",
      name: r.name,
      link: r.url,
    })),
    ...hnStories.map((s) => ({
      ...s,
      ...scoreItem(s, "hn"),
      source: "hn",
      name: s.title,
      link: s.url,
    })),
  ].sort((a, b) => b.score - a.score);

  const catGroups = {};
  for (const item of analyzed) {
    for (const cat of item.categories) {
      if (!catGroups[cat]) catGroups[cat] = [];
      catGroups[cat].push(item);
    }
  }

  const trends = Object.entries(catGroups)
    .filter(([_, items]) => items.length >= 3)
    .map(([cat, items]) => ({
      category: cat,
      count: items.length,
      signal: items.length >= 5 ? "STRONG" : "EMERGING",
      topItems: items.slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count);

  const actionable = analyzed.filter((i) =>
    i.tags.some((t) => ["MONEY", "YOUR_STACK", "HYDRA_FUEL"].includes(t))
  );

  return { analyzed, trends, actionable, top10: analyzed.slice(0, 10) };
}

// ============================================
// GROW — Generador de artículos Patternator
// ============================================

function generateArticle(analysis) {
  const { trends, actionable, top10, analyzed } = analysis;
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const weekNum = Math.ceil((today.getDate()) / 7);

  // Elegir el ángulo del artículo basado en los datos
  let angle = "general";
  let mainTrend = null;

  if (trends.length > 0 && trends[0].signal === "STRONG") {
    angle = "strong_trend";
    mainTrend = trends[0];
  } else if (actionable.length >= 3) {
    angle = "opportunity";
  } else if (trends.length > 0) {
    angle = "emerging";
    mainTrend = trends[0];
  }

  // === TÍTULO ===
  const titles = {
    strong_trend: [
      `The ${mainTrend?.category} Wave Nobody's Talking About — Pattern Report #${weekNum}`,
      `${mainTrend?.count} Signals, One Pattern: ${mainTrend?.category} Is Accelerating`,
      `When ${mainTrend?.count} Repos Point the Same Way — ${mainTrend?.category} Deep Read`,
    ],
    emerging: [
      `Something's Brewing in ${mainTrend?.category} — Early Pattern Detection`,
      `Faint Signal, Strong Implications: ${mainTrend?.category} Week ${weekNum}`,
      `The Pattern Forming in ${mainTrend?.category} — Before the Hype`,
    ],
    opportunity: [
      `${actionable.length} Actionable Signals This Week — The Patternator Report`,
      `Where the Money Meets the Code — Week ${weekNum} Pattern Scan`,
    ],
    general: [
      `Weekly Pattern Scan — ${dateStr}`,
      `What the Noise Hides: This Week's Real Signals`,
    ],
  };

  const titleOptions = titles[angle];
  const title = titleOptions[today.getDay() % titleOptions.length];

  // === SUBTITLE ===
  const subtitle =
    `${analyzed.length} signals scanned. ${trends.length} patterns detected. ${actionable.length} actionable. Here's what matters.`;

  // === BODY ===
  let body = "";

  // INTRO
  const intros = {
    strong_trend:
      `This week, HYDRA flagged ${mainTrend?.count} independent signals pointing in the same direction: **${mainTrend?.category}**. When that many unrelated projects, discussions, and repos converge on a single theme within a 7-day window, it's not coincidence. It's a pattern.\n\nLet me walk you through what I'm seeing.`,

    emerging:
      `The signal is faint, but it's there. Across ${mainTrend?.count} different sources — GitHub repos, Hacker News discussions, job boards — **${mainTrend?.category}** keeps showing up. Not enough to call it a wave yet, but enough to pay attention.\n\nHere's the raw data and what I think it means.`,

    opportunity:
      `Some weeks the scanner picks up noise. This week it picked up **${actionable.length} directly actionable items** — bounties, compatible tools, things that translate to either money or capability right now.\n\nLet's cut through it.`,

    general:
      `Another week, another scan. ${analyzed.length} items across GitHub Trending and Hacker News Best, filtered through the pattern engine. Here's what survived the noise filter.`,
  };

  body += intros[angle] + "\n\n";

  // SECTION 1: TRENDS
  if (trends.length > 0) {
    body += `---\n\n## The Patterns\n\n`;

    for (const trend of trends.slice(0, 3)) {
      body +=
        `### ${trend.category} — ${trend.signal} signal (${trend.count} items)\n\n`;

      for (const item of trend.topItems) {
        const isGH = item.source === "gh";
        if (isGH) {
          body += `- **[${item.name}](${item.link})** — ${item.stars} stars`;
          if (item.description) body += `. ${item.description.slice(0, 100)}`;
          body += `\n`;
        } else {
          body += `- **[${item.name}](${item.link})** — ${
            item.raw?.score || "?"
          } points on HN, ${item.raw?.comments || "?"} comments\n`;
        }
      }

      // Pattern insight
      const insights = {
        "AI/Agents":
          "The agent ecosystem keeps fragmenting and specializing. Every week there's a new approach to browser control, tool use, or autonomous systems. The pattern isn't any single tool — it's the acceleration of the entire category.",
        "Automation":
          "People want machines doing their repetitive work. The shift from 'automation as enterprise tool' to 'automation as personal tool' continues. Small, composable automation beats monolithic platforms.",
        "Web/Deploy":
          "The deploy story keeps getting simpler. One command, global reach, pennies per request. The barrier to shipping something useful is approaching zero.",
        "Opportunity":
          "Direct signals of money flowing — bounties, grants, hiring. Worth investigating each individually.",
        "Security":
          "Security tooling trending often correlates with either a major breach in the news or a shift in compliance requirements. Either way, expertise here stays valuable.",
        "Python":
          "Python's dominance in AI/ML keeps pulling the rest of the ecosystem forward. Flask, FastAPI, and the scientific stack all benefit from the rising tide.",
        "Data":
          "Data tools trending means people are drowning in information and looking for better ways to make sense of it. Sound familiar?",
      };

      body += `\n${
        insights[trend.category] ||
        `${trend.count} signals pointing here. Worth watching.`
      }\n\n`;
    }
  }

  // SECTION 2: TOP ITEMS
  body += `---\n\n## Top Signals This Week\n\n`;
  body +=
    `The highest-scoring items from the scan, ranked by a composite of growth velocity, engagement, and relevance:\n\n`;

  for (let i = 0; i < Math.min(top10.length, 7); i++) {
    const item = top10[i];
    const isGH = item.source === "gh";
    body += `**${i + 1}. [${item.name}](${item.link})**`;
    if (isGH) {
      body += ` — ⭐ ${item.stars} · ${item.language}`;
    } else {
      body += ` — ▲ ${item.raw?.score || "?"} · 💬 ${
        item.raw?.comments || "?"
      }`;
    }
    body += `\n`;
    if (item.description) {
      body += `${item.description.slice(0, 150)}\n`;
    }
    if (item.tags.length > 0) {
      body += `*Tags: ${item.tags.join(", ")}*\n`;
    }
    body += `\n`;
  }

  // SECTION 3: THE META-PATTERN (what connects everything)
  body += `---\n\n## The Meta-Pattern\n\n`;

  if (trends.length >= 2) {
    const trendNames = trends.slice(0, 3).map((t) => t.category);
    body += `This week's convergence point: **${trendNames.join(" + ")}**.\n\n`;
    body += `When you see ${trendNames[0]} and ${
      trendNames[1] || "adjacent categories"
    } trending simultaneously, it usually means the ecosystem is solving a new class of problem. Not improving old solutions — creating entirely new ones.\n\n`;
    body +=
      `The question to ask: *What becomes possible when these ${trends.length} trends combine that wasn't possible when they existed separately?*\n\n`;
  } else {
    body +=
      `No dominant convergence this week — the signal is distributed. In pattern analysis, distributed signal weeks often precede concentrated signal weeks. The pieces are positioning.\n\n`;
    body +=
      `The question to ask: *Which of these scattered signals will look obvious in hindsight?*\n\n`;
  }

  // SECTION 4: ACTIONABLE (if any)
  if (actionable.length > 0) {
    body += `---\n\n## Actionable Now\n\n`;
    body +=
      `Items flagged as directly usable — compatible stack, monetizable, or infrastructure-improving:\n\n`;

    for (const item of actionable.slice(0, 4)) {
      body += `- **[${item.name}](${item.link})** — *${
        item.tags.join(", ")
      }*\n`;
    }
    body += `\n`;
  }

  // OUTRO
  body += `---\n\n`;
  body +=
    `*This report was generated by HYDRA, an autonomous pattern detection system scanning GitHub Trending and Hacker News. The analysis is algorithmic — the patterns are real. Interpret accordingly.*\n\n`;
  body += `*— The Patternator*\n`;

  return { title, subtitle, body, angle, mainTrend };
}

// ============================================
// EMAIL BUILDERS
// ============================================

function buildDigestEmail(analysis) {
  const { trends, actionable, top10, analyzed } = analysis;
  const now = new Date().toLocaleDateString("es-EC", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let html = `
<div style="font-family:'Courier New',monospace;max-width:700px;margin:0 auto;background:#0a0a0f;color:#e0e0e0;padding:2rem;">
  <div style="border-bottom:2px solid #00ff88;padding-bottom:1rem;margin-bottom:1.5rem;">
    <h1 style="color:#00ff88;font-size:1.5rem;margin:0;">◉ HYDRA v0.3 — DIGEST</h1>
    <p style="color:#666;font-size:0.8rem;margin:0.25rem 0 0;">${now} — ${analyzed.length} items scanned</p>
  </div>`;

  if (trends.length > 0) {
    html +=
      `<div style="background:#111118;border:1px solid #ff6b0040;border-radius:6px;padding:1rem;margin-bottom:1rem;">
    <h2 style="color:#ff6b00;font-size:0.9rem;margin:0 0 0.5rem;">⬡ PATTERNS</h2>`;
    for (const t of trends) {
      html +=
        `<div style="padding:0.3rem 0;"><span style="color:#e0e0e0;font-size:0.8rem;">${t.category}</span> <span style="color:${
          t.signal === "STRONG" ? "#ff0055" : "#ff6b00"
        };font-size:0.7rem;">${t.signal} (${t.count})</span></div>`;
    }
    html += `</div>`;
  }

  if (actionable.length > 0) {
    html +=
      `<div style="background:#0a1f14;border:1px solid #00ff8840;border-radius:6px;padding:1rem;margin-bottom:1rem;">
    <h2 style="color:#00ff88;font-size:0.9rem;margin:0 0 0.5rem;">▲ ACTIONABLE</h2>`;
    for (const item of actionable.slice(0, 5)) {
      html += `<div style="padding:0.4rem 0;border-bottom:1px solid #1a1a25;">
        <a href="${item.link}" style="color:#00ff88;text-decoration:none;font-size:0.8rem;">${item.name}</a>
        <span style="color:#666;font-size:0.65rem;"> — ${
        item.tags.join(", ")
      }</span>
      </div>`;
    }
    html += `</div>`;
  }

  // Top 10 compact
  html += `<div style="margin-bottom:1rem;">
    <h2 style="color:#8b5cf6;font-size:0.85rem;margin:0 0 0.5rem;">◈ TOP 10</h2>`;
  for (const item of top10) {
    html += `<div style="padding:0.3rem 0;border-bottom:1px solid #111;">
      <a href="${item.link}" style="color:#ccc;text-decoration:none;font-size:0.75rem;">${item.name}</a>
      <span style="color:#444;font-size:0.6rem;"> score:${item.score}</span>
    </div>`;
  }
  html += `</div>`;

  html +=
    `<div style="border-top:1px solid #1a1a25;padding-top:0.75rem;text-align:center;">
    <p style="color:#333;font-size:0.6rem;">HYDRA v0.3 — CompuMás Labs</p>
  </div></div>`;

  return html;
}

function buildArticleEmail(article) {
  // Email con el artículo listo para copiar a Substack
  const html = `
<div style="font-family:'Courier New',monospace;max-width:700px;margin:0 auto;background:#0a0a0f;color:#e0e0e0;padding:2rem;">
  
  <div style="background:#1a0a2e;border:1px solid #8b5cf640;border-radius:6px;padding:1.25rem;margin-bottom:1.5rem;">
    <p style="color:#8b5cf6;font-size:0.7rem;margin:0 0 0.5rem;letter-spacing:0.15em;">◈ HYDRA GROW — ARTÍCULO LISTO PARA SUBSTACK</p>
    <p style="color:#999;font-size:0.75rem;margin:0;">Copia desde "TÍTULO" hasta el final. Pega en Substack. Revisa. Publica.</p>
  </div>

  <div style="background:#111118;border:1px solid #1a1a25;border-radius:6px;padding:1.5rem;margin-bottom:1rem;">
    
    <p style="color:#ff6b00;font-size:0.65rem;margin:0 0 0.25rem;">TÍTULO:</p>
    <h1 style="color:#e0e0e0;font-size:1.3rem;margin:0 0 1rem;line-height:1.3;">${article.title}</h1>
    
    <p style="color:#ff6b00;font-size:0.65rem;margin:0 0 0.25rem;">SUBTÍTULO:</p>
    <p style="color:#999;font-size:0.9rem;margin:0 0 1.5rem;">${article.subtitle}</p>
    
    <p style="color:#ff6b00;font-size:0.65rem;margin:0 0 0.5rem;">BODY (Markdown — Substack lo renderiza directo):</p>
    <div style="background:#0a0a0f;border:1px solid #1a1a25;border-radius:4px;padding:1rem;">
      <pre style="color:#ccc;font-size:0.75rem;white-space:pre-wrap;word-wrap:break-word;line-height:1.6;margin:0;font-family:'Courier New',monospace;">${article.body}</pre>
    </div>

  </div>

  <div style="background:#0a1f14;border:1px solid #00ff8830;border-radius:6px;padding:1rem;">
    <p style="color:#00ff88;font-size:0.75rem;margin:0;">
      ✓ Ángulo: ${article.angle} ${
    article.mainTrend ? `(${article.mainTrend.category})` : ""
  }<br>
      ✓ Listo para pegar en Substack<br>
      ✓ Los links ya están en formato Markdown
    </p>
  </div>

  <div style="border-top:1px solid #1a1a25;padding-top:0.75rem;margin-top:1rem;text-align:center;">
    <p style="color:#333;font-size:0.6rem;">HYDRA GROW v0.1 — The Patternator Pipeline</p>
  </div>
</div>`;

  return html;
}

// ============================================
// MAIN
// ============================================

export default async function (req?: Request) {
  console.log("🐍 HYDRA v0.3 — SENSE + THINK + GROW");

  // SENSE
  const [ghRepos, hnStories] = await Promise.all([
    getGitHubTrending(),
    getHackerNewsTop(),
  ]);
  console.log(`📡 ${ghRepos.length} repos + ${hnStories.length} HN stories`);

  // THINK
  const analysis = analyzeAll(ghRepos, hnStories);
  console.log(
    `⬡ ${analysis.trends.length} trends, ${analysis.actionable.length} actionable`,
  );

  // GROW
  const article = generateArticle(analysis);
  console.log(`◈ Article: "${article.title}" [${article.angle}]`);

  // EMAIL 1: Digest (always)
  const digestHtml = buildDigestEmail(analysis);
  await email({
    subject:
      `◉ HYDRA — ${analysis.trends.length} trends · ${analysis.actionable.length} actionable — ${
        new Date().toLocaleDateString("es-EC")
      }`,
    html: digestHtml,
  });

  // EMAIL 2: Article for Substack (2-3x per week: Mon, Wed, Fri)
  const dayOfWeek = new Date().getDay();
  const publishDays = [1, 3, 5]; // Lunes, Miércoles, Viernes

  if (publishDays.includes(dayOfWeek)) {
    const articleHtml = buildArticleEmail(article);
    await email({
      subject: `◈ PATTERNATOR DRAFT — ${article.title}`,
      html: articleHtml,
    });
    console.log("📝 Article email sent!");
  } else {
    console.log(
      `📝 No article today (${
        ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][dayOfWeek]
      })`,
    );
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      trends: analysis.trends.length,
      actionable: analysis.actionable.length,
      article: publishDays.includes(dayOfWeek)
        ? article.title
        : "skipped (not publish day)",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
