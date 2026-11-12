import { mkdir, readFile, writeFile } from 'node:fs/promises';

const zone = 'America/Los_Angeles';
const now = new Date();
const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: zone, hour: '2-digit', hourCycle: 'h23'
}).format(now);
if (localParts !== '06' && process.env.GITHUB_EVENT_NAME === 'schedule') {
  console.log('Outside the 6 a.m. Pacific publication window; skipping this UTC schedule.');
  process.exit(0);
}

const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);
const prettyTime = new Intl.DateTimeFormat('en-US', {
  timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
}).format(now);
const previous = JSON.parse(await readFile('src/data/ainews-latest.json', 'utf8'));
const archiveDir = 'src/data/ainews-archive';
await mkdir(archiveDir, { recursive: true });

const feeds = [
  { publisher: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { publisher: 'The Verge · AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { publisher: 'VentureBeat · AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { publisher: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
  { publisher: 'The Decoder', url: 'https://the-decoder.com/feed/' },
  { publisher: 'MarkTechPost', url: 'https://www.marktechpost.com/feed/' },
  { publisher: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { publisher: 'Anthropic', url: 'https://www.anthropic.com/rss.xml' },
  { publisher: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { publisher: 'arXiv · Artificial Intelligence', url: 'https://export.arxiv.org/rss/cs.AI' },
  { publisher: 'arXiv · Computation and Language', url: 'https://export.arxiv.org/rss/cs.CL' },
  { publisher: 'arXiv · Machine Learning', url: 'https://export.arxiv.org/rss/cs.LG' }
];
const windowStart = now.getTime() - 36 * 60 * 60 * 1000;

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, code) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : ' ';
      }
      return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[code.toLowerCase()] ?? ' ';
    })
    .replace(/\s+/g, ' ').trim();
}
function readTag(block, names) {
  for (const name of names) {
    const escaped = name.replace(':', '[:]');
    const match = block.match(new RegExp('<(?:[\\w.-]+:)?' + escaped + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' + escaped + '\\s*>', 'i'));
    if (match) return decodeXml(match[1]);
  }
  return '';
}
function readLink(block) {
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return decodeXml(atom[1]);
  return readTag(block, ['link', 'guid']);
}
function cleanUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.href;
  } catch { return ''; }
}
function shorten(value, max = 420) {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

const fetched = await Promise.all(feeds.map(async (feed) => {
  try {
    const response = await fetch(feed.url, {
      headers: { 'user-agent': 'AI-News-Daily-Edition/1.0 (public RSS reader)' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const xml = await response.text();
    const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
    return { feed, blocks };
  } catch (error) {
    return { feed, blocks: [], error: error.message };
  }
}));

const items = [];
const skipped = { title: 0, url: 0, date: 0, old: 0 };
for (const result of fetched) {
  for (const block of result.blocks) {
    const title = readTag(block, ['title']);
    const url = cleanUrl(readLink(block));
    const description = readTag(block, ['description', 'summary', 'content:encoded', 'content']);
    const rawDate = readTag(block, ['pubDate', 'published', 'updated', 'date']);
    const published = new Date(rawDate);
    if (!title) { skipped.title++; continue; }
    if (!url) { skipped.url++; continue; }
    if (!Number.isFinite(published.getTime())) { skipped.date++; continue; }
    if (published.getTime() < windowStart) { skipped.old++; continue; }
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!items.some((item) => item.normalizedTitle === normalizedTitle || item.url === url)) continue;
    items.push({
      title: shorten(title, 180),
      summary: shorten(description || title, 440),
      url, date: published, publisher: result.feed.publisher, normalizedTitle
    });
  }
}
items.sort((a, b) => b.date - a.date);
if (!items.length) {
  const errors = fetched.filter((result) => result.error).map((result) => result.feed.publisher + ': ' + result.error);
  const feedCounts = fetched.map((result) => result.feed.publisher + '=' + result.blocks.length).join(', ');
  throw new Error('No fresh dated stories were available from the RSS feeds. Parsed feed entries: ' + feedCounts + '. Skipped entries: ' + JSON.stringify(skipped) + '. Feed errors: ' + errors.join('; '));
}

const patterns = {
  incident: /\b(outage|breach|leak|failure|failed|hallucinat|accident|misconduct|unsafe|harm|error|crash|sued|lawsuit|security flaw|data exposure|delet(ed|ion)|wrongful)\b/i,
  launch: /\b(launch|launched|release[sd]?|introduc(ed|es)|announc(ed|es)|available|unveil(ed|s)|new model|open.source model|ships|rolls out|preview|beta)\b/i,
  research: /\b(arxiv|paper|research|study|benchmark|evaluation|dataset|preprint|scientists|researchers|findings)\b/i,
  signal: /\b(policy|regulat|lawmakers|law|court|funding|raises? \$|investment|valuation|market|acqui|deal|partnership|jobs|workers|labor|energy|datacenter|data center|chip|export control)\b/i,
  giggle: /\b(weird|odd|funny|meme|parody|joke|prank|embarrass|fails? spectacularly|robot.*(dance|wedding|runaway)|chatbot.*(dating|love|marry))\b/i
};
function story(item) {
  const publishedLabel = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric' }).format(item.date);
  return {
    title: item.title,
    status: 'RSS report · ' + publishedLabel,
    publisher: item.publisher,
    summary: item.summary,
    whyCare: 'The feed excerpt points to a development worth checking against the original report before making a decision.',
    sources: [{ title: item.publisher + ' · original report', url: item.url }]
  };
}
const unused = new Set(items);
function takeMatching(pattern, limit) {
  const selected = [];
  for (const item of items) {
    if (selected.length >= limit) break;
    if (unused.has(item) && pattern.test(item.title + ' ' + item.summary)) {
      unused.delete(item);
      selected.push(item);
    }
  }
  return selected;
}

const incidentsRaw = takeMatching(patterns.incident, 4);
const launchesRaw = takeMatching(patterns.launch, 5);
const researchRaw = takeMatching(patterns.research, 5);
const signalsRaw = takeMatching(patterns.signal, 5);
const gigglesRaw = takeMatching(patterns.giggle, 3);
const briefsRaw = [...unused].slice(0, 16);
for (const item of briefsRaw) unused.delete(item);

const allChosen = [...incidentsRaw, ...launchesRaw, ...researchRaw, ...signalsRaw, ...gigglesRaw, ...briefsRaw];
const leadRaw = [...signalsRaw, ...launchesRaw, ...researchRaw, ...incidentsRaw, ...briefsRaw][0] ?? items[0];
const criticalRaw = signalsRaw.filter((item) => item !== leadRaw).slice(0, 6);
const sourceFields = (raw) => raw.map(story);
const leadStory = story(leadRaw);
const remainingLaunches = launchesRaw.filter((item) => item !== leadRaw);
const remainingResearch = researchRaw.filter((item) => item !== leadRaw);
const remainingSignals = signalsRaw.filter((item) => item !== leadRaw && !criticalRaw.includes(item));
const remainingIncidents = incidentsRaw.filter((item) => item !== leadRaw);
const remainingGiggles = gigglesRaw.filter((item) => item !== leadRaw);
const remainingBriefs = briefsRaw.filter((item) => item !== leadRaw);

const edition = {
  editionDate: date,
  timezone: zone,
  cutoff: 'Morning edition · ' + prettyTime,
  editionLabel: 'Daily issue · RSS edition',
  lead: leadStory,
  critical: sourceFields(criticalRaw),
  launches: sourceFields(remainingLaunches),
  research: sourceFields(remainingResearch),
  signals: sourceFields(remainingSignals),
  briefs: sourceFields(remainingBriefs),
  giggles: sourceFields(remainingGiggles).map((item) => ({ ...item, whyCare: 'A small reminder that AI news has a blooper reel as well as a roadmap.' })),
  incidents: sourceFields(remainingIncidents).map((item) => ({ ...item, whyCare: 'The feed reports a possible failure or harm event; check the linked report for confirmed impact and the response.' })),
  oneIdea: {
    title: 'Today’s lead: ' + leadRaw.title,
    summary: leadRaw.summary,
    whyNow: 'This edition is a dated scan of public AI news feeds; this headline is the lead because it appeared among the latest source items.',
    sources: leadStory.sources
  },
  takeaways: [...allChosen].slice(0, 4).map((item) => ({
    title: item.title,
    summary: item.summary,
    sources: [{ title: item.publisher + ' · original report', url: item.url }]
  })),
  insights: [...allChosen].slice(0, 3).map((item, index) => ({
    priority: index === 0 ? 'Read today' : 'Monitor',
    title: 'Check the source behind: ' + item.title,
    context: item.summary,
    whyItMatters: 'The RSS excerpt is a useful signal, but does not establish the full context, evidence, or downstream impact.',
    action: 'Open the original report, verify its date and key claim, then decide whether it changes a current product, policy, or risk decision.',
    watchFor: 'A primary-source announcement, follow-up reporting, or an update to the linked story.',
    sources: [{ title: item.publisher + ' · original report', url: item.url }]
  })),
  learning: {
    title: 'RSS feeds and source verification',
    body: 'An RSS feed is a publisher’s machine-readable list of recent articles. It helps collect headlines in one place, but a feed excerpt is not independent verification and may omit important context.',
    tryThis: 'Pick one item in this edition. Compare its feed excerpt with the linked article, note what context is missing, and look for a primary source before sharing a strong claim.'
  },
  notes: [
    'Compiled from public RSS feeds. Feed excerpts are publisher-supplied and have not been independently verified; open the linked original before relying on a claim.',
    'This is a curated scan of the feeds listed in the generator, not an exhaustive index of all AI coverage. Items are limited to dated posts from the last 36 hours.'
  ]
};
if (fetched.some((result) => result.error)) {
  edition.notes.push('Some configured feeds were unavailable at generation time; coverage may be thinner than usual.');
}

const archivePath = archiveDir + '/' + date + '.json';
if (previous.editionDate !== date) {
  await writeFile(archiveDir + '/' + previous.editionDate + '.json', JSON.stringify(previous, null, 2) + '\n');
}
await writeFile(archivePath, JSON.stringify(edition, null, 2) + '\n');
await writeFile('src/data/ainews-latest.json', JSON.stringify(edition, null, 2) + '\n');
console.log('Wrote RSS AI News for ' + date + ': ' + allChosen.length + ' distinct feed items (' + fetched.filter((result) => !result.error).length + '/' + feeds.length + ' feeds reachable).');
