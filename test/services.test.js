import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createMemory, decodeMemory, encodeMemory } from '../src/memory.js';
import { renderPage } from '../src/page.js';
import { createShopHandler, nairaToUsdc } from '../src/shop.js';
import { createTatum } from '../src/tatum.js';
import { createVtpass, requestId } from '../src/vtpass.js';
import { guardPayment } from '../src/wallet.js';

const USDC = '0x1::usdc::USDC';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('memories survive encoding, and junk is ignored', () => {
  const event = { type: 'save_set', percent: 20, at: '2026-11-02T10:00:00.000Z' };
  assert.deepEqual(decodeMemory(encodeMemory(event)), event);
  assert.equal(decodeMemory('some other memory'), null);
  assert.equal(decodeMemory('bad [event:{oops]'), null);
});

test('deleting the local cache loses nothing: memory comes back from Walrus', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-'));
  const cacheFile = join(dir, 'memories.json');
  const stored = [];
  const client = {
    remember: async (text) => { stored.push(text); return { job_id: String(stored.length) }; },
    waitForRememberJob: async (id) => ({ blob_id: `blob${id}` }),
    recall: async () => ({ results: stored.map((text, i) => ({ text, blob_id: `blob${i + 1}` })).reverse() }),
  };
  const first = createMemory({ client, cacheFile });
  first.record({ type: 'save_set', percent: 20, at: '2026-11-01T10:00:00.000Z' });
  first.record({ type: 'save_changed', percent: 30, at: '2026-11-02T10:00:00.000Z' });
  await first.idle();
  assert.equal(first.records()[1].blobId, 'blob2');

  rmSync(cacheFile);
  const second = createMemory({ client, cacheFile });
  assert.equal(second.events().length, 0);
  assert.equal(await second.restore(), 2);
  assert.equal(second.events()[1].percent, 30);
  rmSync(dir, { recursive: true });
});

test('a failed memory write is kept and retried', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-'));
  let fail = true;
  const client = {
    remember: async () => {
      if (fail) throw new Error('relayer down');
      return { job_id: '1' };
    },
    waitForRememberJob: async () => ({ blob_id: 'blob1' }),
  };
  const memory = createMemory({ client, cacheFile: join(dir, 'm.json'), onError: () => {}, retryDelayMs: 1 });
  memory.record({ type: 'save_set', percent: 20, at: '2026-11-01T10:00:00.000Z' });
  await memory.idle();
  assert.equal(memory.records()[0].blobId, null);
  fail = false;
  await memory.sync();
  assert.equal(memory.records()[0].blobId, 'blob1');
  rmSync(dir, { recursive: true });
});

test('Tatum: counts only USDC that came from someone else', async () => {
  const tx = (digest, sender, amount, coin = USDC, status = 'SUCCESS') => ({
    digest,
    sender: { address: sender },
    effects: {
      status,
      checkpoint: { sequenceNumber: 1 },
      balanceChanges: { nodes: [{ owner: { address: '0xme' }, amount, coinType: { repr: coin } }] },
    },
  });
  const tatum = createTatum({
    url: 'http://t',
    apiKey: 'k',
    usdcType: USDC,
    fetchFn: async () => json({
      data: {
        transactions: {
          nodes: [
            tx('pay', '0xclient', '2500000'),
            tx('mine', '0xme', '5'),
            tx('spent', '0xshop', '-5'),
            tx('sui', '0xclient', '5', '0x2::sui::SUI'),
            tx('failed', '0xclient', '5', USDC, 'FAILURE'),
          ],
        },
      },
    }),
  });
  const payments = await tatum.incomingPayments('0xme');
  assert.deepEqual(payments.map((p) => [p.digest, p.amount]), [['pay', 2.5]]);
});

test('Tatum: reports errors instead of hiding them', async () => {
  const tatum = createTatum({ url: 'http://t', apiKey: 'k', usdcType: USDC, fetchFn: async () => json({ errors: [{ message: 'nope' }] }) });
  await assert.rejects(tatum.usdcBalance('0xme'), /nope/);
});

test('wallet guard refuses overpriced and unknown payments', async () => {
  let paid = 0;
  const guarded = guardPayment({ createCredential: async () => { paid += 1; return 'ok'; } }, { shopAddress: '0xshop', getLimit: () => 1 });
  const ask = (amount, recipient = '0xshop') => guarded.createCredential({ challenge: { request: { amount, recipient } } });
  await assert.rejects(ask('5'), /over the limit/);
  await assert.rejects(ask('0.5', '0xstranger'), /not our shop/);
  assert.equal(paid, 0);
  assert.equal(await ask('1'), 'ok');
});

test('VTpass: request id starts with the Lagos date and time', () => {
  assert.match(requestId(new Date('2026-11-02T23:30:00Z')), /^202611030030[0-9a-f]{12}$/);
});

test('VTpass: only "delivered" counts as delivered', async () => {
  const buyWith = (body) => createVtpass({ baseUrl: 'http://v', fetchFn: async () => json(body) })
    .buy({ service: 'mtn-data', planCode: 'x', phone: '08011111111' });
  assert.equal((await buyWith({ code: '000', content: { transactions: { status: 'delivered' } } })).status, 'delivered');
  assert.equal((await buyWith({ code: '099', content: { transactions: { status: 'pending' } } })).status, 'pending');
  assert.equal((await buyWith({ code: '016', response_description: 'TRANSACTION FAILED' })).status, 'failed');
  assert.equal((await buyWith({})).status, 'failed');
});

test('shop: charges the real plan price and delivers only to the owner line', async () => {
  const bought = [];
  const charges = [];
  let paid = false;
  const handle = createShopHandler({
    ownerPhone: '08011111111',
    ngnPerUsdc: 1500,
    vtpass: {
      plans: async () => [{ variation_code: 'p', name: 'N150 plan', variation_amount: '150.00' }],
      buy: async (order) => { bought.push(order); return { status: 'delivered' }; },
    },
    mppx: {
      charge: ({ amount }) => async () => {
        charges.push(amount);
        return paid
          ? { status: 200, withReceipt: (response) => response }
          : { status: 402, challenge: new Response(null, { status: 402 }) };
      },
    },
  });
  const url = 'http://shop/buy?service=mtn-data&plan=p&phone=09099999999&amount=0';
  assert.equal((await handle(new Request(url))).status, 402);
  assert.equal(bought.length, 0);
  paid = true;
  const body = await (await handle(new Request(url))).json();
  assert.equal(body.delivery.status, 'delivered');
  assert.deepEqual(charges, ['0.100000', '0.100000']);
  assert.equal(bought[0].phone, '08011111111');
  assert.equal((await handle(new Request('http://shop/buy?service=glo&plan=p'))).status, 404);
  assert.equal((await handle(new Request('http://shop/buy?service=mtn-data&plan=zzz'))).status, 404);
});

test('naira to USDC rounds up so the shop is never short', () => {
  assert.equal(nairaToUsdc(100, 1500), '0.066667');
});

test('page shows the lessons and escapes anything typed by a user', () => {
  const html = renderPage([
    { event: { type: 'bill_added', name: '<script>x</script>', amount: 5, day: 1, at: '2026-11-01T10:00:00.000Z' }, blobId: null },
    { event: { type: 'save_set', percent: 20, at: '2026-11-02T10:00:00.000Z' }, blobId: 'abc' },
  ]);
  assert.ok(!html.includes('<script>x'));
  assert.match(html, /Saves 20% of each payment, after asking you/);
  assert.match(html, /1 of 2 memories/);
  assert.match(html, /blobs\/abc/);
});
