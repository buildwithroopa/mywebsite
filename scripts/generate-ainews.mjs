import { readFile, writeFile } from 'node:fs/promises';

if (!process.env.OPENAI_API_KEY) throw new Error('Add OPENAI_API_KEY under GitHub repository Settings → Secrets and variables → Actions.');

const zone = 'America/Los_Angeles';
const now = new Date();
const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const prettyTime = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(now);
const previous = JSON.parse(await readFile('src/data/ainews-latest.json', 'utf8'));

const prompt = `Write today's AI News newspaper edition for ${date}, with a research cutoff of ${prettyTime} (${zone}). The previous edition date was ${previous.editionDate}; cover developments published since its cutoff (use the last 24 hours on a first run).

Search broadly across model and product releases, research papers and benchmarks, agents, compute/chips, business and markets, policy, safety, labor, education, and practical tools. Use live web search in several passes, inspect a mix of primary sources and independent reporting, group duplicate coverage into distinct underlying events, and verify dates, claims, and links. Aim for 12–20 distinct useful storylines across the whole issue when the news supports it; do not pad with duplicates or stale items. Include a concise briefing wire for additional verified items so the front page is not limited to only the biggest stories. Prefer primary sources plus independent reporting. Do not say you found “all” articles. Label allegations, early reports, research preprints, forecasts, and company claims clearly. Do not invent facts, sources, quotes, failures, or comedy. A quiet section is acceptable; return an empty list and let the site explain no verified item made the edition.

Organize the issue for a newspaper:
- lead: the single most consequential verified/developing story
- critical: 3–6 high-impact distinct stories; do not repeat the lead
- launches: 2–5 distinct model, product, tool, or availability launches; prioritize what is newly available and note access/pricing limits
- research: 2–5 papers, benchmarks, evaluations, or scientific uses; identify preprints and company claims clearly
- signals: 3–6 distinct business, market, compute, policy, workforce, education, or public-interest developments
- briefs: 4–8 additional concise, sourced stories not duplicated in the lead or other desks; one or two sentences each
- giggles: 0–3 genuinely amusing AI-related news stories, humor in headlines/commentary only; every underlying event must be factual and sourced
- incidents: 0–5 AI failures, accidental actions, harmful bot behavior, outages, security incidents, or notable model failures. Omit the entire Incident Desk when empty; do not add an empty-state sentence or placeholder. Be precise about what happened, who confirmed it, impact, and response; distinguish reported allegations from confirmed incidents.
- insights: 2–4 actionable briefs. Each must explain context (what happened), why it matters to a real decision, a concrete next action, and what signal to watch. Avoid generic “keep an eye on AI” advice.
- learning: one plain-language concept connected to today's news, plus a small exercise
- notes: important uncertainty, corrections, and coverage limits

Return ONLY valid JSON with these exact top-level keys and field shapes:
{
  "editionDate":"YYYY-MM-DD",
  "timezone":"America/Los_Angeles",
  "cutoff":"Morning edition · local time",
  "editionLabel":"Daily issue",
  "lead":{"title":"...","status":"Confirmed/Reported/Research · date","summary":"...","whyCare":"...","sources":[{"title":"...","url":"https://..."}]},
  "critical":[{"title":"...","status":"...","publisher":"...","summary":"...","whyCare":"...","sources":[{"title":"...","url":"https://..."}]}],
  "launches":[{"title":"...","status":"...","publisher":"...","summary":"...","sources":[{"title":"...","url":"https://..."}]}],
  "research":[{"title":"...","status":"...","publisher":"...","summary":"...","sources":[{"title":"...","url":"https://..."}]}],
  "signals":[{"title":"...","status":"...","publisher":"...","summary":"...","sources":[{"title":"...","url":"https://..."}]}],
  "briefs":[{"title":"...","status":"...","publisher":"...","summary":"...","sources":[{"title":"...","url":"https://..."}]}],
  "giggles":[{"title":"...","status":"...","publisher":"...","summary":"...","whyCare":"...","sources":[{"title":"...","url":"https://..."}]}],
  "incidents":[{"title":"...","status":"Confirmed/Reported/Alleged · date","publisher":"...","summary":"...","whyCare":"Impact and response, with uncertainty stated","sources":[{"title":"...","url":"https://..."}]}],
  "insights":[{"priority":"Do today/Monitor/Read","title":"...","context":"What happened and why now","whyItMatters":"Decision relevance","action":"A specific low-friction step","watchFor":"Signal or milestone","sources":[{"title":"...","url":"https://..."}]}],
  "learning":{"title":"...","body":"...","tryThis":"..."},
  "notes":["..."]
}
Every lead/story/insight needs at least one direct HTTPS source. Return only content substantiated by those sources, with compact prose.`;

const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-6-astra',
    reasoning: { effort: 'high' },
    tools: [{ type: 'web_search', search_context_size: 'high' }],
    text: { format: { type: 'json_object' } },
    input: prompt,
    store: false
  })
});
if (!response.ok) throw new Error(`OpenAI Responses API failed (${response.status}): ${await response.text()}`);
const result = await response.json();
if (!result.output_text) throw new Error('The model returned no edition text.');
const edition = JSON.parse(result.output_text);

const storyLists = [edition.critical, edition.launches, edition.research, edition.signals, edition.briefs, edition.giggles, edition.incidents];
if (edition.editionDate !== date || edition.timezone !== zone || !edition.lead?.title ||
    storyLists.some((list) => !Array.isArray(list)) || !Array.isArray(edition.insights) ||
    !edition.learning?.title || !Array.isArray(edition.notes)) {
  throw new Error('The edition is missing required fields or has the wrong date/timezone.');
}
const sourcedItems = [edition.lead, ...storyLists.flat(), ...edition.insights];
for (const item of sourcedItems) {
  if (!item.title || (!item.summary && !item.context) || !Array.isArray(item.sources) || item.sources.length < 1) {
    throw new Error(`A lead, story, or insight is missing text or sources: ${item.title ?? 'untitled'}`);
  }
  for (const source of item.sources) {
    if (!source.title) throw new Error(`A source is missing its title for: ${item.title}`);
    const url = new URL(source.url);
    if (url.protocol !== 'https:') throw new Error(`Non-HTTPS source URL: ${source.url}`);
  }
}
for (const item of edition.insights) {
  if (!item.context || !item.whyItMatters || !item.action || !item.watchFor) throw new Error(`An insight needs context, relevance, action, and a signal: ${item.title}`);
}

edition.cutoff = `Morning edition · ${prettyTime}`;
edition.editionLabel = 'Daily issue';
await writeFile('src/data/ainews-latest.json', `${JSON.stringify(edition, null, 2)}\n`);
console.log(`Wrote AI News for ${date}: ${[edition.lead,...storyLists.flat()].length} sourced story items, ${edition.insights.length} actionable insights.`);
