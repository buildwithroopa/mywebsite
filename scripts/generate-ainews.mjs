import { readFile, writeFile } from 'node:fs/promises';

if (!process.env.OPENAI_API_KEY) throw new Error('Add OPENAI_API_KEY under GitHub repository Settings → Secrets and variables → Actions.');

const zone = 'America/Los_Angeles';
const now = new Date();
const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const prettyTime = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(now);

const previous = JSON.parse(await readFile('src/data/ainews-latest.json', 'utf8'));
const prompt = `Create today's Daily AI Gazette edition. Current date in ${zone}: ${date}. Current cutoff: ${prettyTime}. Previous edition date: ${previous.editionDate}.

Research AI developments published since the previous edition's cutoff (use the last 24 hours on first run). Use live web search to find coverage across models, products, research, agents, chips/compute, business, policy, safety, labor, education, and practical tools. Seek primary sources, group duplicate coverage, and verify each material claim. Exclude unverified rumors, stale stories, unsupported numbers, and claims you cannot source. Mark reporting, preprints, forecasts, allegations, and company claims clearly. Do not invent quotations or facts. Prefer a concise truthful issue over padding. Make headlines lightly witty while keeping the reporting straight and respectful.

Return ONLY a valid JSON object with exactly these fields:
{
  "editionDate":"YYYY-MM-DD",
  "timezone":"America/Los_Angeles",
  "cutoff":"Morning edition · [local time]",
  "editionLabel":"Daily edition",
  "lead":{"title":"...","status":"Confirmed/Reported/Research · date","summary":"...","whyCare":"...","sources":[{"title":"...","url":"https://..."}]},
  "news":[{"title":"...","status":"...","publisher":"...","summary":"...","whyCare":"...","sources":[{"title":"...","url":"https://..."}]}],
  "learning":{"title":"...","body":"...","tryThis":"..."},
  "focus":[{"kind":"Do/Watch/Skip","text":"..."}],
  "notes":["..."]
}
Include 3 to 8 distinct news stories when there is enough verified news; fewer is fine. Every lead/news item needs at least one direct source URL, ideally a primary source and independent reporting where appropriate. Use no Markdown fences, no extra fields. If the news search is quiet, state that honestly in notes and do not recycle old stories as new.`;

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
const text = result.output_text;
if (!text) throw new Error('The model returned no edition text.');
const edition = JSON.parse(text);
if (edition.editionDate !== date || edition.timezone !== zone || !edition.lead?.title || !Array.isArray(edition.news) || !edition.learning?.title || !Array.isArray(edition.focus) || !Array.isArray(edition.notes)) {
  throw new Error('The edition is missing required fields or has the wrong date/timezone.');
}
for (const item of [edition.lead, ...edition.news]) {
  if (!item.title || !item.summary || !Array.isArray(item.sources) || item.sources.length < 1) throw new Error(`Story is missing its summary or sources: ${item.title ?? 'untitled'}`);
  for (const source of item.sources) {
    const url = new URL(source.url);
    if (url.protocol !== 'https:') throw new Error(`Non-HTTPS source URL: ${source.url}`);
  }
}
edition.cutoff = `Morning edition · ${prettyTime}`;
edition.editionLabel = 'Daily edition';
await writeFile('src/data/ainews-latest.json', `${JSON.stringify(edition, null, 2)}\n`);
console.log(`Wrote Daily AI Gazette for ${date} with ${edition.news.length} stories.`);
