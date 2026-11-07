// The public pages: "what it learned" (every memory, and the agent with memory on vs off)
// and "try it" (a sandbox that runs the agent's real learning code in the browser).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { applyEvent, describeEvent, emptyState, estimateMonthlyMb, rebuildState, suggestPlans } from './brain.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const gb = (mb) => `${Math.round((mb / 1024) * 10) / 10}GB`;
const NETWORK_NAMES = { 'mtn-data': 'MTN', 'airtel-data': 'Airtel', 'glo-data': 'Glo', 'etisalat-data': '9mobile' };
const COMPARE_SERVICE = 'mtn-data'; // the "memory off" agent doesn't know the network, so compare on MTN

const LINKS = {
  video: 'https://x.com/Mxrshxll_on_X/status/2118639664181506300',
  code: 'https://github.com/Bigmanmarsh/Suisub',
  blog: 'https://dev.to/bigmanmarsh/my-money-had-no-memory-so-i-built-an-agent-that-does-3bnp',
};

function behaviour(state) {
  const save = state.savePercent === null
    ? 'Doesn\'t know your savings rate yet'
    : `Saves ${state.savePercent}% of each payment, ${state.saveAuto ? 'by itself' : 'after asking you'}`;
  const data = state.data.auto
    ? `Renews data by itself, up to N${state.data.autoLimitNaira}`
    : state.data.service ? 'Asks before buying data' : 'Doesn\'t know your network yet';
  const monthly = estimateMonthlyMb(state);
  return [
    save,
    data,
    monthly === null ? null : `Suggests plans for about ${gb(monthly)} of data a month`,
    state.data.maxNaira === null ? null : `Won't suggest data over N${state.data.maxNaira}`,
  ].filter(Boolean);
}

// What the agent would say about data, given what it knows.
function dataAdvice(state, plans) {
  if (!plans) return null;
  const { recommended, cheaper, bigger } = suggestPlans(state, plans);
  if (!recommended) return 'No plan fits what it knows';
  const monthly = estimateMonthlyMb(state);
  const why = monthly === null ? 'best value, with no idea how much you use' : `for about ${gb(monthly)} a month`;
  const extra = [cheaper && `cheaper: ${cheaper.name}`, bigger && `bigger: ${bigger.name}`].filter(Boolean).join('; ');
  return `Suggests ${recommended.name} (${why})${extra ? `. Also offers ${extra}` : ''}`;
}

// A public page hides what could identify the owner's life, like bill names and amounts.
export const publicEvent = (event) => (event.type === 'bill_added' ? { ...event, name: 'a bill', amount: 0 } : event);
const lesson = (event, isPublic) => (isPublic && event.type === 'bill_added' ? 'User added a monthly bill.' : describeEvent(event));

const STYLE = `
:root{--bg:#f7f7f4;--card:#fff;--ink:#1c1f1d;--dim:#5e6660;--line:#dfe2dc;--accent:#0b6b4f;--off:#9a3b2e}
@media (prefers-color-scheme:dark){:root{--bg:#141715;--card:#1d211e;--ink:#eef0ec;--dim:#a3aba5;--line:#333a35;--accent:#5fd0a8;--off:#e08a7a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:760px;margin:auto;padding:32px 16px}h1{margin:0;font-size:28px}h2{margin:32px 0 12px;font-size:18px}
.sub{color:var(--dim);margin:4px 0 0}.links{display:flex;flex-wrap:wrap;gap:8px 16px;margin:12px 0 0}
.card,ol li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card ul{margin:0;padding-left:20px}.card h3{margin:0 0 8px;font-size:15px}.on h3{color:var(--accent)}.off h3{color:var(--off)}
.compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}ol p{margin:4px 0}time{color:var(--dim);font-size:13px}
.now{color:var(--dim);font-size:14px}a{color:var(--accent)}.wait{color:var(--dim);font-size:14px}
button{font:inherit;font-size:14px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button:hover{border-color:var(--accent)}.row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.log{font-size:14px;color:var(--dim)}.log li{padding:8px 12px}.note{font-size:14px;color:var(--dim)}`;

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

export function renderPage(records, { isPublic = false, plans = null } = {}) {
  const ordered = [...records].sort((a, b) => a.event.at.localeCompare(b.event.at));
  const running = emptyState();
  const rows = ordered.map(({ event, blobId }) => {
    const before = behaviour(running);
    applyEvent(running, event);
    const changed = behaviour(running).filter((line) => !before.includes(line));
    const proof = blobId
      ? `<a href="https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${encodeURIComponent(blobId)}">Stored on Walrus</a>`
      : '<span class="wait">Saving…</span>';
    return `<li><time>${escapeHtml(new Date(event.at).toUTCString())}</time>
      <p>${escapeHtml(lesson(event, isPublic))}</p>
      <p class="now">${changed.length ? `Now: ${escapeHtml(changed.join('. '))}` : 'Behaviour unchanged, but it counts towards trust'}</p>${proof}</li>`;
  }).join('');

  // Memory on: everything restored from Walrus. Memory off: the same agent with nothing.
  const network = running.data.service ?? COMPARE_SERVICE;
  const forgetful = { ...emptyState(), data: { ...emptyState().data, service: network } };
  const list = (lines) => lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const onLines = [...behaviour(running), dataAdvice(running, plans)].filter(Boolean);
  const offLines = [
    'Asks how much to save every time pay lands',
    'Never acts alone: it has no record of your approvals',
    'Has no idea how much data you use',
    dataAdvice(forgetful, plans),
  ].filter(Boolean);
  const saved = ordered.filter((record) => record.blobId).length;

  return shell('What It Learned', `<h1>What it learned</h1>
<p class="sub">${saved} of ${ordered.length} memories stored on Walrus Mainnet. Everything below is rebuilt from them.</p>
<p class="links"><a href="/try">Try the agent yourself</a><a href="${LINKS.video}">Demo video</a><a href="${LINKS.code}">Code</a><a href="${LINKS.blog}">Write-up</a></p>
<h2>The same agent, with and without its memory</h2>
<div class="compare">
<div class="card on"><h3>Memory on (from Walrus)</h3><ul>${list(onLines)}</ul></div>
<div class="card off"><h3>Memory off</h3><ul>${list(offLines)}</ul></div>
</div>
<p class="note">Plan suggestions use live ${escapeHtml(NETWORK_NAMES[network] ?? network)} prices from VTpass.</p>
<h2>Every lesson, oldest first</h2><ol>${rows || '<li>Nothing yet. Say /start to the bot.</li>'}</ol>`);
}

export function renderTryPage() {
  return shell('Try Suisub', `<h1>Try Suisub</h1>
<p class="sub">This runs the agent's real learning code in your browser. Nothing here moves money or writes to Walrus.</p>
<p class="links"><a href="/">What the real agent has learned</a><a href="${LINKS.video}">Demo video</a><a href="${LINKS.code}">Code</a></p>
<div class="row"><button data-start="real">Start from the owner's real memories</button><button data-start="empty">Start with no memory</button></div>
<h2>What the agent does now</h2><div class="card"><ul id="now"></ul></div>
<h2>Teach it</h2>
<div class="card">
<div class="row"><button data-act="pay">100 USDC lands</button><button data-act="approve">Approve the saving</button><button data-act="rate">Change rate to 30%</button></div>
<div class="row"><button data-act="usage:5">I use 5GB</button><button data-act="usage:20">I use 20GB</button><button data-act="ranout">I ran out early</button><button data-act="left">I had data left</button></div>
<div class="row"><button data-act="buy">Buy the suggested plan</button><button data-act="expensive">Too expensive</button></div>
</div>
<h2>What it said</h2><ol class="log" id="log"></ol>
<script type="module" src="/try.js"></script>`);
}

export function startPage({ memory, port, host = '127.0.0.1', isPublic = false, getPlans = async () => null }) {
  const brain = readFileSync(new URL('./brain.js', import.meta.url), 'utf8');
  const tryScript = readFileSync(new URL('./try-client.js', import.meta.url), 'utf8');
  const send = (res, type, body) => {
    res.setHeader('content-type', `${type}; charset=utf-8`);
    res.end(body);
  };

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const events = memory.records().map((record) => record.event);
    const service = rebuildState(events).data.service ?? COMPARE_SERVICE;
    const plans = await getPlans(service).catch(() => null);
    if (pathname === '/try') return send(res, 'text/html', renderTryPage());
    if (pathname === '/brain.js') return send(res, 'text/javascript', brain);
    if (pathname === '/try.js') return send(res, 'text/javascript', tryScript);
    if (pathname === '/try-data.json') {
      const safe = isPublic ? events.map(publicEvent) : events;
      return send(res, 'application/json', JSON.stringify({ events: safe, plans: plans ?? [] }));
    }
    return send(res, 'text/html', renderPage(memory.records(), { isPublic, plans }));
  });
  server.listen(port, host);
  return server;
}
