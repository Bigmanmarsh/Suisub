// The "what it learned" page: every memory, and how it changed the agent's behaviour.
import { createServer } from 'node:http';
import { applyEvent, describeEvent, emptyState } from './brain.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function behaviour(state) {
  const save = state.savePercent === null
    ? 'Doesn\'t know your savings rate yet'
    : `Saves ${state.savePercent}% of each payment, ${state.saveAuto ? 'by itself' : 'after asking you'}`;
  const data = state.data.auto
    ? `Renews data by itself, up to N${state.data.autoLimitNaira}`
    : state.data.service ? 'Asks before buying data' : 'Doesn\'t know your network yet';
  return [save, data, state.data.maxNaira === null ? null : `Won't suggest data over N${state.data.maxNaira}`]
    .filter(Boolean);
}

export function renderPage(records) {
  const ordered = [...records].sort((a, b) => a.event.at.localeCompare(b.event.at));
  const running = emptyState();
  const rows = ordered.map(({ event, blobId }) => {
    applyEvent(running, event);
    const proof = blobId
      ? `<a href="https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${encodeURIComponent(blobId)}">Stored on Walrus</a>`
      : '<span class="wait">Saving…</span>';
    return `<li><time>${escapeHtml(new Date(event.at).toUTCString())}</time>
      <p>${escapeHtml(describeEvent(event))}</p>
      <p class="now">Now: ${escapeHtml(behaviour(running)[0])}</p>${proof}</li>`;
  }).join('');
  const now = behaviour(running).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const saved = ordered.filter((record) => record.blobId).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>What It Learned</title>
<style>
:root{--bg:#f7f7f4;--card:#fff;--ink:#1c1f1d;--dim:#5e6660;--line:#dfe2dc;--accent:#0b6b4f}
@media (prefers-color-scheme:dark){:root{--bg:#141715;--card:#1d211e;--ink:#eef0ec;--dim:#a3aba5;--line:#333a35;--accent:#5fd0a8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:680px;margin:auto;padding:32px 16px}h1{margin:0;font-size:28px}h2{margin:32px 0 12px;font-size:18px}
.sub{color:var(--dim);margin:4px 0 0}.card,ol li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card ul{margin:0;padding-left:20px}ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
ol p{margin:4px 0}time{color:var(--dim);font-size:13px}.now{color:var(--dim);font-size:14px}a{color:var(--accent);font-size:14px}.wait{color:var(--dim);font-size:14px}
</style></head><body><main><h1>What it learned</h1>
<p class="sub">${saved} of ${ordered.length} memories stored on Walrus Mainnet</p>
<h2>How it behaves now</h2><div class="card"><ul>${now}</ul></div>
<h2>Every lesson, oldest first</h2><ol>${rows || '<li>Nothing yet. Say /start to the bot.</li>'}</ol>
</main></body></html>`;
}

export function startPage({ memory, port }) {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(renderPage(memory.records()));
  });
  server.listen(port, '127.0.0.1');
  return server;
}
