import { mkdir, readFile, writeFile } from 'node:fs/promises';

const zone = 'America/Los_Angeles';
const now = new Date();
const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: zone, hour: '2-digit', hourCycle: 'h23'
}).format(now);
if (localParts !== '06' && ['schedule', 'push'].includes(process.env.GITHUB_EVENT_NAME)) {
  console.log('Outside the 6 a.m. Pacific publication window; skipping this automatic run.');
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
  { publisher: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { publisher: 'Google News · AI', url: 'https://news.google.com/rss/search?q=AI+OR+artificial+intelligence+when%3A1d&hl=en-US&gl=US&ceid=US:en' },
  { publisher: 'Google News · AI agents', url: 'https://news.google.com/rss/search?q=AI+agents+OR+artificial+intelligence+agents+when%3A1d&hl=en-US&gl=US&ceid=US:en' },
  { publisher: 'Google News · AI research and policy', url: 'https://news.google.com/rss/search?q=AI+research+OR+AI+policy+OR+AI+chips+when%3A1d&hl=en-US&gl=US&ceid=US:en' },
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
    const localName = name.split(':').at(-1);
    const pattern = new RegExp('<(?:[A-Za-z0-9_.-]+:)?' + localName + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?' + localName + '\\s*>', 'i');
    const match = block.match(pattern);
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
function noEmDashes(value) {
  return value.replace(/\s*—\s*/g, ': ').replace(/\s+/g, ' ').trim();
}
function shorten(value, max = 420) {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}
function escapeSvg(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function createDailyMeme(item, index, previousTitles) {
  const subject = (item.title + ' ' + item.summary).toLowerCase();
  let kind = 'workflow';
  if (/breach|security|privacy|data|leak/.test(subject)) kind = 'data';
  else if (/shop|retail|fake|fraud|merchant|link/.test(subject)) kind = 'shopping';
  else if (/energy|compute|chip|campus|data cent|server/.test(subject)) kind = 'compute';
  else if (/agent|booking|assistant|automation|task/.test(subject)) kind = 'agent';
  else if (/research|study|benchmark|evaluation|paper/.test(subject)) kind = 'research';

  const copy = {
    data: [
      ['The chat had one stop. The data took a scenic route.', 'Check which providers receive prompts and how long they keep them.', 'Data boundaries', 'A cheerful robot sends a chat bubble through a door marked VENDOR, while a tiny checklist asks who else can see it.'],
      ['My prompt brought a plus-one: the vendor integration.', 'Check data access, retention, and incident notices before sharing sensitive text.', 'Vendor access', 'A friendly robot notices an extra guest following a message bubble into a cloud-shaped doorway.']
    ],
    shopping: [
      ['The assistant found a shop. My browser asked for ID.', 'Verify the exact domain and seller before entering payment details.', 'AI shopping', 'A robot shopper compares a suspicious web address with a trusted store sign.'],
      ['The link looked official. The URL had other plans.', 'A fluent recommendation is not proof that a retailer is legitimate.', 'Link checking', 'A robot uses a magnifying glass on a wobbly storefront sign and a long web address.']
    ],
    compute: [
      ['The prompt was tiny. The server room had other plans.', 'Compute plans also depend on power, permits, and financing.', 'AI infrastructure', 'A small robot stands beside a comically large server rack and an electricity meter.'],
      ['The model asked for one more GPU. The power bill joined the meeting.', 'Track energy and infrastructure alongside model performance.', 'Compute costs', 'A robot presents a server rack to a very unimpressed electricity meter.']
    ],
    agent: [
      ['The bot can click. The human can still say no.', 'Keep a person in the loop for purchases and other consequential actions.', 'AI agents', 'A robot pauses at a large red button while a human holds a simple approval card.'],
      ['One click away, and still waiting for approval.', 'Give an agent only the access needed for its task.', 'Human review', 'A robot reaches toward a button while a small approval light stays red.']
    ],
    research: [
      ['Top benchmark score. Tuesday test still pending.', 'Check whether a benchmark matches the work you need done.', 'AI evaluation', 'A proud robot holds a trophy beside a practical checklist and a calendar marked Tuesday.'],
      ['The leaderboard is not the customer.', 'Test models on representative examples from your own workflow.', 'Real-world tests', 'A robot poses with a leaderboard while a human points to a real-world task list.']
    ],
    workflow: [
      ['The AI called it a quick task. The checklist disagreed.', 'Break a broad request into steps you can review.', 'AI workflows', 'A robot opens a tiny task card that unfolds into an unexpectedly long checklist.'],
      ['One click, said the demo. Fourteen tabs, said the browser.', 'Try a workflow end to end before handing it to an agent.', 'Agent testing', 'A smiling robot sits in front of a laptop surrounded by a few oversized browser tabs.']
    ]
  }[kind];

  const dateSeed = [...date].reduce((sum, digit) => sum + Number(digit), 0);
  let variant = (dateSeed + index) % copy.length;
  if (previousTitles.has(copy[variant][0])) variant = (variant + 1) % copy.length;
  const [title, lesson, topic, alt] = copy[variant];
  const paper = ['#f2eadb', '#e9e7df', '#f4eee4', '#e5e7e3'][(dateSeed + index) % 4];
  const red = ['#c92b34', '#b7332c', '#ba3f2b', '#a92c35'][(dateSeed + index * 2) % 4];
  const prop = kind === 'data'
    ? '<rect x="846" y="245" width="180" height="172" rx="18" fill="#fff" stroke="#171717" stroke-width="7"/><path d="M901 311v-18a35 35 0 0 1 70 0v18" fill="none" stroke="' + red + '" stroke-width="13"/><rect x="887" y="307" width="98" height="75" rx="14" fill="' + red + '"/><circle cx="936" cy="342" r="8" fill="#fff"/>'
    : kind === 'shopping'
      ? '<rect x="840" y="245" width="205" height="156" rx="14" fill="#fff" stroke="#171717" stroke-width="7"/><path d="M840 281h205" stroke="#171717" stroke-width="7"/><circle cx="863" cy="264" r="6" fill="' + red + '"/><text x="865" y="337" font-family="monospace" font-size="26" fill="' + red + '">shop?</text><path d="M1011 358l-26-8 43-54 16 12z" fill="#171717"/>'
      : kind === 'compute'
        ? '<rect x="855" y="238" width="150" height="58" rx="9" fill="#fff" stroke="#171717" stroke-width="7"/><rect x="855" y="313" width="150" height="58" rx="9" fill="#fff" stroke="#171717" stroke-width="7"/><circle cx="884" cy="267" r="8" fill="' + red + '"/><circle cx="884" cy="342" r="8" fill="' + red + '"/><path d="M958 238l-17 41h22l-14 38 42-52h-25l15-27z" fill="' + red + '"/>'
        : kind === 'agent'
          ? '<circle cx="940" cy="326" r="96" fill="' + red + '" stroke="#171717" stroke-width="8"/><circle cx="940" cy="326" r="61" fill="#f2eadb" stroke="#171717" stroke-width="7"/><text x="940" y="337" text-anchor="middle" font-family="monospace" font-size="24" fill="#171717">WAIT</text>'
          : kind === 'research'
            ? '<path d="M850 393h200v-36H850z" fill="' + red + '" stroke="#171717" stroke-width="7"/><path d="M875 357v-76h46v76M932 357v-120h46v120M989 357v-54h46v54" fill="#fff" stroke="#171717" stroke-width="7"/><text x="955" y="224" text-anchor="middle" font-family="monospace" font-size="22" fill="' + red + '">TEST</text>'
            : '<rect x="850" y="233" width="185" height="183" rx="16" fill="#fff" stroke="#171717" stroke-width="7"/><path d="M882 283l11 11 22-26M882 335l11 11 22-26M882 387l11 11 22-26" fill="none" stroke="' + red + '" stroke-width="8"/><path d="M932 281h70M932 333h70M932 385h70" stroke="#171717" stroke-width="8"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img">
    <rect width="1200" height="675" fill="${paper}"/>
    <path d="M0 536H1200" stroke="#171717" stroke-width="9"/>
    <path d="M0 553H1200" stroke="${red}" stroke-width="4"/>
    <path d="M60 76H1140" stroke="#171717" stroke-width="3"/>
    <text x="62" y="58" font-family="monospace" font-size="25" letter-spacing="4" fill="${red}">AI GIGGLES · DAILY DOODLE</text>
    <text x="1138" y="58" text-anchor="end" font-family="monospace" font-size="20" fill="#555">${date}</text>
    <g stroke="#171717" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">
      <path d="M0 487h1200v49H0z" fill="#ded8ca"/>
      <rect x="135" y="372" width="230" height="136" rx="18" fill="#fff"/>
      <rect x="159" y="393" width="183" height="88" rx="10" fill="#ecebe5"/>
      <path d="M197 476l27-35 25 22 26-32 37 45" fill="none"/>
      <path d="M204 375v-36a54 54 0 0 1 108 0v36" fill="none" stroke="${red}" stroke-width="12"/>
      <rect x="190" y="369" width="135" height="124" rx="20" fill="#fff"/>
      <path d="M212 411h91M212 438h72" fill="none" stroke-width="7"/>
      <rect x="501" y="265" width="194" height="154" rx="52" fill="#fff"/>
      <path d="M598 265v-46" fill="none" stroke-width="9"/>
      <circle cx="598" cy="204" r="18" fill="${red}"/>
      <circle cx="552" cy="329" r="11" fill="#171717" stroke="none"/>
      <circle cx="643" cy="329" r="11" fill="#171717" stroke="none"/>
      <path d="M567 371q30 29 60 0" fill="none" stroke-width="8"/>
      <rect x="531" y="411" width="133" height="115" rx="22" fill="${red}"/>
      <path d="M531 438l-78 39M664 438l91 29" fill="none" stroke-width="18"/>
      <circle cx="454" cy="478" r="16" fill="#fff"/>
      <circle cx="754" cy="467" r="16" fill="#fff"/>
      <path d="M557 526l-31 11M637 526l31 11" fill="none" stroke-width="18"/>
      ${prop}
    </g>
    <rect x="367" y="594" width="466" height="45" rx="22" fill="#171717"/>
    <text x="600" y="624" text-anchor="middle" font-family="monospace" font-size="21" letter-spacing="3" fill="#fff">FRESH FROM TODAY'S AI NEWS</text>
  </svg>`;
  return { image: '/images/ainews-giggle-' + date + '-' + (index + 1) + '.svg', alt, topic, title, lesson, svg };
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
    const title = noEmDashes(readTag(block, ['title']));
    const url = cleanUrl(readLink(block));
    const description = noEmDashes(readTag(block, ['description', 'summary', 'content:encoded', 'content']));
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
      url, date: published, publisher: readTag(block, ['source']) || result.feed.publisher, normalizedTitle
    });
  }
}
items.sort((a, b) => b.date - a.date);
if (!items.length) {
  const errors = fetched.filter((result) => result.error).map((result) => result.feed.publisher + ': ' + result.error);
  const feedCounts = fetched.map((result) => result.feed.publisher + '=' + result.blocks.length).join(', ');
  console.error('No fresh dated stories were parsed. Refusing to publish yesterday as today. Parsed entries: ' + feedCounts + '. Skipped: ' + JSON.stringify(skipped) + '. Feed errors: ' + errors.join('; '));
  process.exit(1);
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
    whyCare: 'The feed only gives a short excerpt. Open the linked report to check what happened and what the excerpt leaves out.',
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
const previousMemeTitles = new Set((previous.giggleMemes ?? []).map((meme) => meme.title));
const memeSources = [leadRaw, ...allChosen.filter((item) => item !== leadRaw)].slice(0, 2);
const generatedMemes = memeSources.map((item, index) => createDailyMeme(item, index, previousMemeTitles));
await mkdir('public/images', { recursive: true });
for (const meme of generatedMemes) {
  await writeFile('public' + meme.image, meme.svg + '\n');
}
const giggleMemes = generatedMemes.map(({ svg, ...meme }) => meme);
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
  cutoff: 'Morning edition',
  editionLabel: 'Daily issue · RSS edition',
  lead: leadStory,
  critical: sourceFields(criticalRaw),
  launches: sourceFields(remainingLaunches),
  research: sourceFields(remainingResearch),
  signals: sourceFields(remainingSignals),
  briefs: sourceFields(remainingBriefs),
  giggles: sourceFields(remainingGiggles).map((item) => ({ ...item, whyCare: 'A small reminder that AI news has a blooper reel as well as a roadmap.' })),
  giggleMemes,
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
