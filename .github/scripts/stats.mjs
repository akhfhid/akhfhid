// Generates assets/stats-dark.svg and assets/stats-light.svg from the GitHub GraphQL API.
// Usage: GITHUB_TOKEN=... node .github/scripts/stats.mjs <username>
import { writeFileSync, mkdirSync } from "node:fs";

const login = process.argv[2] || "akhfhid";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

const query = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }
    }
    repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100){
      totalCount
      nodes{ stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } } }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
  body: JSON.stringify({ query, variables: { login } }),
});
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors));
const u = json.data.user;

// ---- contributions & streaks ----
const days = u.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const total = u.contributionsCollection.contributionCalendar.totalContributions;

let longest = { len: 0, start: null, end: null };
let run = { len: 0, start: null };
for (const d of days) {
  if (d.contributionCount > 0) {
    if (run.len === 0) run.start = d.date;
    run.len++;
    if (run.len > longest.len) longest = { len: run.len, start: run.start, end: d.date };
  } else run = { len: 0, start: null };
}
// Current streak: today may still be empty without breaking it.
let current = 0, currentStart = null;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) { current++; currentStart = days[i].date; }
  else if (i === days.length - 1) continue;
  else break;
}

// ---- languages (bytes across public, non-fork repos) ----
const langs = new Map();
let stars = 0;
for (const r of u.repositories.nodes) {
  stars += r.stargazerCount;
  for (const e of r.languages.edges) {
    const cur = langs.get(e.node.name) || { size: 0, color: e.node.color || "#8b949e" };
    cur.size += e.size;
    langs.set(e.node.name, cur);
  }
}
const langTotal = [...langs.values()].reduce((a, b) => a + b.size, 0) || 1;
let langList = [...langs.entries()].map(([name, v]) => ({ name, color: v.color, pct: (v.size / langTotal) * 100 }))
  .sort((a, b) => b.pct - a.pct);
const TOP = 5;
if (langList.length > TOP) {
  const rest = langList.slice(TOP).reduce((a, b) => a + b.pct, 0);
  langList = [...langList.slice(0, TOP), { name: "Other", color: null, pct: rest }];
}

// ---- render ----
const fmtDate = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const num = (n) => n.toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

const themes = {
  dark: { fg: "#f0f6fc", muted: "#9198a1", rule: "#262c36", track: "#3d444d", accent: "#3fb950" },
  light: { fg: "#1f2328", muted: "#59636e", rule: "#d1d9e0", track: "#d1d9e0", accent: "#1a7f37" },
};

function render(t) {
  const W = 880;
  const updated = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
  const kpis = [
    { value: num(total), label: "Contributions", sub: `≈ ${num(Math.round(total / 52))} per week` },
    { value: num(current), label: "Current streak", sub: current ? `days · since ${fmtDate(currentStart)}` : "days", accent: current > 0 },
    { value: num(longest.len), label: "Longest streak", sub: longest.len ? `days · ${fmtDate(longest.start)} – ${fmtDate(longest.end)}` : "days" },
    { value: num(u.repositories.totalCount), label: "Public repos", sub: `${num(stars)} stars earned` },
  ];
  const colW = W / kpis.length;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="250" viewBox="0 0 ${W} 250" role="img" aria-label="GitHub activity for ${esc(login)}: ${total} contributions in the past 12 months, current streak ${current} days, longest streak ${longest.len} days">`;
  s += `<text x="0" y="16" font-family="${MONO}" font-size="12" letter-spacing=".08em" fill="${t.muted}">PAST 12 MONTHS</text>`;
  s += `<text x="${W}" y="16" font-family="${MONO}" font-size="12" fill="${t.muted}" text-anchor="end">updated ${updated}</text>`;
  s += `<line x1="0" y1="32" x2="${W}" y2="32" stroke="${t.rule}"/>`;
  kpis.forEach((k, i) => {
    const x = i * colW + colW / 2;
    if (i) s += `<line x1="${i * colW}" y1="52" x2="${i * colW}" y2="128" stroke="${t.rule}"/>`;
    s += `<text x="${x}" y="88" font-family="${SANS}" font-size="34" font-weight="800" letter-spacing="-.02em" text-anchor="middle" fill="${k.accent ? t.accent : t.fg}">${esc(k.value)}</text>`;
    s += `<text x="${x}" y="110" font-family="${SANS}" font-size="14" font-weight="600" text-anchor="middle" fill="${t.fg}">${esc(k.label)}</text>`;
    s += `<text x="${x}" y="127" font-family="${MONO}" font-size="12" text-anchor="middle" fill="${t.muted}">${esc(k.sub)}</text>`;
  });
  s += `<line x1="0" y1="148" x2="${W}" y2="148" stroke="${t.rule}"/>`;
  s += `<text x="0" y="176" font-family="${MONO}" font-size="12" letter-spacing=".08em" fill="${t.muted}">LANGUAGES · PUBLIC REPOS</text>`;

  // stacked bar with 2px gaps
  const barY = 190, barH = 8, gap = 2;
  const usable = W - gap * (langList.length - 1);
  let x = 0;
  s += `<clipPath id="bar"><rect x="0" y="${barY}" width="${W}" height="${barH}" rx="4"/></clipPath><g clip-path="url(#bar)">`;
  for (const l of langList) {
    const w = Math.max((l.pct / 100) * usable, 1);
    s += `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${l.color || t.track}"/>`;
    x += w + gap;
  }
  s += `</g>`;

  // legend in equal columns; tspans let the renderer place the percentage after the name
  const legW = W / langList.length;
  langList.forEach((l, i) => {
    const lx = i * legW;
    s += `<circle cx="${lx + 5}" cy="226" r="5" fill="${l.color || t.track}"/>`;
    s += `<text x="${lx + 16}" y="231" font-family="${SANS}" font-size="13" fill="${t.fg}">${esc(l.name)}<tspan dx="6" font-family="${MONO}" font-size="12" fill="${t.muted}">${l.pct.toFixed(1)}%</tspan></text>`;
  });
  return s + `</svg>\n`;
}

mkdirSync("assets", { recursive: true });
for (const [name, t] of Object.entries(themes)) writeFileSync(`assets/stats-${name}.svg`, render(t));
console.log(`total=${total} current=${current} longest=${longest.len} repos=${u.repositories.totalCount} stars=${stars}`);
console.log(langList.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));

// ---- mirror the GitSkins stock chart without its watermark ----
for (const mode of ["dark", "light"]) {
  try {
    const r = await fetch(`https://www.gitskins.com/api/section/stock-chart?username=${login}&mode=${mode}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const svg = await r.text();
    if (!svg.startsWith("<svg")) throw new Error("not an SVG");
    writeFileSync(`assets/stock-${mode}.svg`, svg.replace(/<text[^>]*>\s*gitskins\.com\s*<\/text>/gi, ""));
  } catch (e) {
    console.warn(`stock chart (${mode}) skipped, keeping previous file: ${e.message}`);
  }
}
