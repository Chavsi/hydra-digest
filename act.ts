// =============================================
// HYDRA ACT — Cazador de Bounties & Oportunidades
// Val separado — Cron independiente
// Solo te avisa cuando hay algo que vale la pena
// $0 costo
// =============================================

import { email } from "https://esm.town/v/std/email";

// ============================================
// SKILLS FILTER — Lo que sabes hacer
// ============================================
const MY_SKILLS = {
  strong: [
    "python",
    "flask",
    "postgresql",
    "postgres",
    "html",
    "css",
    "javascript",
    "htmx",
    "jinja",
    "gunicorn",
    "redis",
    "sqlalchemy",
    "web app",
    "webapp",
    "full-stack",
    "fullstack",
    "full stack",
    "deploy",
    "deployment",
    "api",
    "rest api",
    "backend",
  ],
  medium: [
    "typescript",
    "docker",
    "linux",
    "nginx",
    "cloudflare",
    "scraping",
    "automation",
    "bot",
    "cli",
    "shell",
    "bash",
    "database",
    "sql",
    "migration",
    "testing",
  ],
  avoid: [
    "react native",
    "swift",
    "kotlin",
    "java ",
    "c++",
    "c#",
    "unity",
    "unreal",
    "mobile app",
    "ios ",
    "android",
    "solidity",
    "smart contract",
    "blockchain",
    "machine learning",
    "ml model",
    "tensorflow",
    "pytorch",
    "go ",
    "golang",
    "rust ",
    "haskell",
    "elixir",
    "ruby on rails",
  ],
};

function skillMatch(text) {
  const lower = text.toLowerCase();

  // Avoid check first
  for (const kw of MY_SKILLS.avoid) {
    if (lower.includes(kw)) return { match: false, score: 0, level: "avoid" };
  }

  let score = 0;
  let level = "none";

  for (const kw of MY_SKILLS.strong) {
    if (lower.includes(kw)) {
      score += 3;
      level = "strong";
    }
  }
  for (const kw of MY_SKILLS.medium) {
    if (lower.includes(kw)) {
      score += 1;
      level = score > 3 ? "strong" : "medium";
    }
  }

  return { match: score > 0, score, level };
}

// ============================================
// SOURCE 1: GitHub Issues — "bounty" label search
// ============================================
async function searchGitHubBounties() {
  const results = [];
  const queries = [
    "label:bounty state:open language:python",
    "label:bounty state:open language:javascript",
    'label:"help wanted" label:"paid" state:open',
    'label:bounty state:open "flask"',
    'label:bounty state:open "web app"',
    '"bounty" "$" state:open language:python',
  ];

  for (const q of queries) {
    try {
      const resp = await fetch(
        `https://api.github.com/search/issues?q=${
          encodeURIComponent(q)
        }&sort=created&order=desc&per_page=10`,
        {
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "HYDRA-ACT/0.1",
          },
        },
      );

      if (resp.ok) {
        const data = await resp.json();
        for (const issue of (data.items || [])) {
          if (!results.find((r) => r.url === issue.html_url)) {
            // Extraer monto si hay $ en el body o title
            const amount = extractAmount(
              issue.title + " " + (issue.body || "").slice(0, 500),
            );

            results.push({
              source: "github",
              title: issue.title,
              url: issue.html_url,
              repo: issue.repository_url?.split("/").slice(-2).join("/") || "",
              labels: (issue.labels || []).map((l) => l.name).join(", "),
              amount,
              body: (issue.body || "").slice(0, 300),
              created: issue.created_at?.split("T")[0],
              comments: issue.comments,
            });
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error(`GH bounty error: ${e.message}`);
    }
  }

  return results;
}

// ============================================
// SOURCE 2: Algora — Open bounties via API
// ============================================
async function searchAlgoraBounties() {
  const results = [];

  try {
    // Algora tiene una página pública de bounties que podemos parsear
    // via su API endpoint
    const resp = await fetch("https://algora.io/bounties?status=open", {
      headers: { "User-Agent": "HYDRA-ACT/0.1" },
    });

    if (resp.ok) {
      const html = await resp.text();

      // Extraer bounties del HTML (Algora renderiza server-side)
      const bountyPattern =
        /href="(\/[^"]*\/bounties\/[^"]*)"[^>]*>.*?(\$[\d,]+)/gs;
      let match;
      while ((match = bountyPattern.exec(html)) !== null) {
        results.push({
          source: "algora",
          title: `Algora Bounty`,
          url: `https://algora.io${match[1]}`,
          amount: match[2],
          body: "",
        });
      }
    }
  } catch (e) {
    console.error(`Algora error: ${e.message}`);
  }

  // Fallback: buscar en GitHub repos que usan Algora
  try {
    const resp = await fetch(
      `https://api.github.com/search/issues?q=${
        encodeURIComponent('"/bounty" "algora" state:open')
      }&sort=created&order=desc&per_page=10`,
      {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "HYDRA-ACT/0.1",
        },
      },
    );

    if (resp.ok) {
      const data = await resp.json();
      for (const issue of (data.items || [])) {
        if (!results.find((r) => r.url === issue.html_url)) {
          const amount = extractAmount(
            issue.title + " " + (issue.body || "").slice(0, 500),
          );
          results.push({
            source: "algora",
            title: issue.title,
            url: issue.html_url,
            repo: issue.repository_url?.split("/").slice(-2).join("/") || "",
            amount,
            body: (issue.body || "").slice(0, 300),
            created: issue.created_at?.split("T")[0],
          });
        }
      }
    }
  } catch (e) {
    console.error(`Algora GH search error: ${e.message}`);
  }

  return results;
}

// ============================================
// SOURCE 3: GitHub "paid" / "funded" issues
// ============================================
async function searchPaidIssues() {
  const results = [];
  const queries = [
    'label:"funded" state:open',
    'label:"💰" state:open',
    'label:"reward" state:open',
    'label:"money" state:open',
  ];

  for (const q of queries) {
    try {
      const resp = await fetch(
        `https://api.github.com/search/issues?q=${
          encodeURIComponent(q)
        }&sort=created&order=desc&per_page=5`,
        {
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "HYDRA-ACT/0.1",
          },
        },
      );

      if (resp.ok) {
        const data = await resp.json();
        for (const issue of (data.items || [])) {
          if (!results.find((r) => r.url === issue.html_url)) {
            const amount = extractAmount(
              issue.title + " " + (issue.body || "").slice(0, 500),
            );
            results.push({
              source: "github-paid",
              title: issue.title,
              url: issue.html_url,
              repo: issue.repository_url?.split("/").slice(-2).join("/") || "",
              labels: (issue.labels || []).map((l) => l.name).join(", "),
              amount,
              body: (issue.body || "").slice(0, 300),
              created: issue.created_at?.split("T")[0],
            });
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.error(`Paid issues error: ${e.message}`);
    }
  }

  return results;
}

// ============================================
// UTILS
// ============================================

function extractAmount(text) {
  // Buscar patrones de dinero: $500, $1,000, 500 USD, etc.
  const patterns = [
    /\$[\d,]+(?:\.\d{2})?/g,
    /(\d{2,})\s*(?:USD|usd|dollars?)/g,
    /bounty[:\s]*\$?([\d,]+)/gi,
    /reward[:\s]*\$?([\d,]+)/gi,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return null;
}

function estimateValue(bounty) {
  if (!bounty.amount) return 0;
  const num = parseInt(bounty.amount.replace(/[$,]/g, ""));
  return isNaN(num) ? 0 : num;
}

// ============================================
// ANALYSIS — Score & filter bounties
// ============================================

function analyzeBounties(allBounties) {
  const analyzed = [];

  for (const bounty of allBounties) {
    const text = `${bounty.title} ${bounty.body || ""} ${bounty.labels || ""} ${
      bounty.repo || ""
    }`;
    const skill = skillMatch(text);

    if (skill.match) {
      const value = estimateValue(bounty);

      // Composite score
      let score = skill.score;
      if (value >= 500) score += 10;
      else if (value >= 200) score += 7;
      else if (value >= 50) score += 4;
      else if (value > 0) score += 2;

      // Boost recent
      if (bounty.created) {
        const daysOld = (Date.now() - new Date(bounty.created).getTime()) /
          86400000;
        if (daysOld <= 3) score += 3;
        else if (daysOld <= 7) score += 1;
      }

      // Low competition (few comments)
      if (bounty.comments !== undefined && bounty.comments <= 2) {
        score += 2;
      }

      analyzed.push({
        ...bounty,
        skill,
        value,
        score,
        verdict: score >= 10 ? "🔥 GO" : score >= 6 ? "👀 LOOK" : "📌 SAVE",
      });
    }
  }

  return analyzed.sort((a, b) => b.score - a.score);
}

// ============================================
// EMAIL
// ============================================

function buildBountyEmail(bounties) {
  const now = new Date().toLocaleDateString("es-EC", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const goItems = bounties.filter((b) => b.verdict === "🔥 GO");
  const lookItems = bounties.filter((b) => b.verdict === "👀 LOOK");
  const saveItems = bounties.filter((b) => b.verdict === "📌 SAVE");

  let html = `
<div style="font-family:'Courier New',monospace;max-width:700px;margin:0 auto;background:#0a0a0f;color:#e0e0e0;padding:2rem;">
  <div style="border-bottom:2px solid #ff0055;padding-bottom:1rem;margin-bottom:1.5rem;">
    <h1 style="color:#ff0055;font-size:1.5rem;margin:0;">▲ HYDRA ACT — Bounty Hunter</h1>
    <p style="color:#666;font-size:0.8rem;margin:0.25rem 0 0;">${now}</p>
    <p style="color:#888;font-size:0.75rem;margin:0.5rem 0 0;">
      ${bounties.length} bounties match your skills (de ${
    goItems.length + lookItems.length + saveItems.length
  } filtrados)
    </p>
  </div>`;

  // GO items
  if (goItems.length > 0) {
    html += `
  <div style="background:#1f0a10;border:1px solid #ff005540;border-radius:6px;padding:1rem;margin-bottom:1.5rem;">
    <h2 style="color:#ff0055;font-size:1rem;margin:0 0 0.75rem;">🔥 GO — Muévete en estos</h2>`;

    for (const b of goItems) {
      html += buildBountyCard(b, "#ff0055");
    }
    html += `</div>`;
  }

  // LOOK items
  if (lookItems.length > 0) {
    html += `
  <div style="background:#111118;border:1px solid #ff6b0040;border-radius:6px;padding:1rem;margin-bottom:1.5rem;">
    <h2 style="color:#ff6b00;font-size:0.9rem;margin:0 0 0.75rem;">👀 LOOK — Vale revisarlos</h2>`;

    for (const b of lookItems.slice(0, 5)) {
      html += buildBountyCard(b, "#ff6b00");
    }
    html += `</div>`;
  }

  // SAVE items
  if (saveItems.length > 0) {
    html += `
  <div style="margin-bottom:1.5rem;">
    <h2 style="color:#555;font-size:0.85rem;border-left:3px solid #333;padding-left:0.75rem;">📌 SAVE — Por si acaso</h2>`;

    for (const b of saveItems.slice(0, 5)) {
      html += `
    <div style="padding:0.3rem 0;border-bottom:1px solid #111;">
      <a href="${b.url}" style="color:#888;text-decoration:none;font-size:0.75rem;">${b.title}</a>
      ${
        b.amount
          ? `<span style="color:#00ff88;font-size:0.65rem;"> ${b.amount}</span>`
          : ""
      }
      <span style="color:#444;font-size:0.6rem;"> — ${b.source}</span>
    </div>`;
    }
    html += `</div>`;
  }

  // No results
  if (bounties.length === 0) {
    html += `
  <div style="background:#111118;border:1px solid #1a1a25;border-radius:6px;padding:1.5rem;text-align:center;">
    <p style="color:#666;font-size:0.85rem;">No bounties matching your skills today. HYDRA sigue buscando.</p>
  </div>`;
  }

  html += `
  <div style="border-top:1px solid #1a1a25;padding-top:0.75rem;margin-top:1rem;text-align:center;">
    <p style="color:#333;font-size:0.6rem;">HYDRA ACT v0.1 — Bounty Hunter — CompuMás Labs</p>
  </div>
</div>`;

  return html;
}

function buildBountyCard(b, accentColor) {
  return `
    <div style="background:#0a0a0f;border:1px solid #1a1a25;border-radius:6px;padding:0.75rem;margin-bottom:0.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <a href="${b.url}" style="color:${accentColor};text-decoration:none;font-size:0.85rem;font-weight:bold;">
            ${b.title.slice(0, 80)}
          </a>
          ${
    b.repo
      ? `<div style="color:#555;font-size:0.65rem;margin-top:0.15rem;">${b.repo}</div>`
      : ""
  }
        </div>
        <div style="text-align:right;white-space:nowrap;margin-left:0.5rem;">
          ${
    b.amount
      ? `<div style="color:#00ff88;font-size:0.9rem;font-weight:bold;">${b.amount}</div>`
      : '<div style="color:#444;font-size:0.7rem;">$ TBD</div>'
  }
          <div style="color:#666;font-size:0.6rem;">${b.source}</div>
        </div>
      </div>
      <div style="margin-top:0.4rem;">
        <span style="background:${accentColor}15;color:${accentColor};font-size:0.6rem;padding:0.1rem 0.4rem;border-radius:3px;">
          ${b.verdict}
        </span>
        <span style="color:#555;font-size:0.6rem;margin-left:0.3rem;">
          Skill: ${b.skill.level} · Score: ${b.score}
        </span>
        ${
    b.labels
      ? `<span style="color:#444;font-size:0.6rem;margin-left:0.3rem;">Tags: ${
        b.labels.slice(0, 50)
      }</span>`
      : ""
  }
      </div>
      ${
    b.body
      ? `<p style="color:#777;font-size:0.7rem;margin:0.4rem 0 0;line-height:1.4;">${
        b.body.slice(0, 150)
      }...</p>`
      : ""
  }
      ${
    b.created
      ? `<div style="color:#333;font-size:0.6rem;margin-top:0.3rem;">Posted: ${b.created} ${
        b.comments !== undefined ? `· ${b.comments} comments` : ""
      }</div>`
      : ""
  }
    </div>`;
}

// ============================================
// MAIN
// ============================================

export default async function (req?: Request) {
  console.log("▲ HYDRA ACT — Bounty scan starting...");

  // Fetch from all sources
  const [ghBounties, algoraBounties, paidIssues] = await Promise.all([
    searchGitHubBounties(),
    searchAlgoraBounties(),
    searchPaidIssues(),
  ]);

  const allBounties = [...ghBounties, ...algoraBounties, ...paidIssues];
  console.log(
    `🔍 Found ${allBounties.length} raw bounties (GH:${ghBounties.length} Algora:${algoraBounties.length} Paid:${paidIssues.length})`,
  );

  // Analyze & filter
  const matched = analyzeBounties(allBounties);
  console.log(`✅ ${matched.length} match your skills`);

  const goCount = matched.filter((b) => b.verdict === "🔥 GO").length;

  // Only send email if there are results worth seeing
  if (matched.length > 0) {
    const html = buildBountyEmail(matched);
    await email({
      subject: `▲ HYDRA ACT — ${
        goCount > 0 ? `${goCount} 🔥 GO` : `${matched.length} bounties`
      } — ${new Date().toLocaleDateString("es-EC")}`,
      html,
    });
    console.log("📧 Bounty email sent!");
  } else {
    console.log("📭 No matching bounties today — no email sent");
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      raw: allBounties.length,
      matched: matched.length,
      go: goCount,
      look: matched.filter((b) => b.verdict === "👀 LOOK").length,
      save: matched.filter((b) => b.verdict === "📌 SAVE").length,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
