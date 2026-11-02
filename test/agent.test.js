import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgent } from '../src/agent.js';

const PLANS = [
  { variation_code: 'cheap', name: 'N100 100MB - 24 hrs', variation_amount: '100.00' },
  { variation_code: 'best', name: 'N1500 6GB - 7 days', variation_amount: '1500.00' },
];

function setup({ delivery = { status: 'delivered', requestId: 'r1' } } = {}) {
  const events = [];
  const messages = [];
  const sent = [];
  const bought = [];
  const quoteUrls = [];
  let clock = Date.parse('2026-11-02T10:00:00Z');
  const agent = createAgent({
    memory: { events: () => [...events], record: (event) => events.push(event) },
    wallet: {
      address: '0xagent',
      async sendUsdc(to, amount) { sent.push({ to, amount }); return 'digest1'; },
      async buyBundle(url, max) { bought.push({ url, max }); return { status: 200, body: { delivery }, digest: 'digest2' }; },
    },
    tatum: { usdcBalance: async () => 5, incomingPayments: async () => [] },
    vtpassPlans: async () => PLANS,
    rates: { current: async () => ({ rate: 1500, source: 'test' }) },
    fetchFn: async (url) => { quoteUrls.push(url); return Response.json({ quote: 'q1', amount: '1.000000' }); },
    shopUrl: 'http://shop',
    config: { savingsAddress: '0xsavings' },
    notify: async (text, buttons) => { messages.push({ text, buttons }); },
    now: () => { clock += 1000; return new Date(clock); },
  });
  const lastButtons = () => messages.at(-1).buttons.flat().map((b) => b.data);
  return { agent, events, messages, sent, bought, quoteUrls, lastButtons };
}

async function pay(ctx, digest) {
  await ctx.agent.handlePay({ digest, amount: 100 });
  return ctx.lastButtons();
}

test('asks first, then earns the right to save by itself', async () => {
  const ctx = setup();
  await ctx.agent.press('setup:20');
  await ctx.agent.press('network:mtn-data');

  for (const digest of ['pay-a-0000000000000', 'pay-b-0000000000000', 'pay-c-0000000000000']) {
    const [yes] = await pay(ctx, digest);
    await ctx.agent.press(yes);
  }
  assert.equal(ctx.sent.length, 3);
  assert.deepEqual(ctx.sent[0], { to: '0xsavings', amount: 20 });
  assert.deepEqual(ctx.lastButtons(), ['saveauto:on', 'saveauto:off']);

  await ctx.agent.press('saveauto:on');
  await ctx.agent.handlePay({ digest: 'pay-d-0000000000000', amount: 50 });
  assert.equal(ctx.sent.length, 4);
  assert.equal(ctx.sent[3].amount, 10);
  assert.match(ctx.messages.at(-1).text, /as you asked/);
  assert.equal(ctx.messages.at(-1).buttons, undefined);
});

test('a correction is applied now and remembered next time', async () => {
  const ctx = setup();
  await ctx.agent.press('setup:20');
  const [, change] = await pay(ctx, 'pay-a-0000000000000');
  await ctx.agent.press(change);
  await ctx.agent.press(ctx.lastButtons()[2]); // 30%
  assert.equal(ctx.sent[0].amount, 30);
  await ctx.agent.handlePay({ digest: 'pay-b-0000000000000', amount: 100 });
  assert.match(ctx.messages.at(-1).text, /save 30 USDC \(30%\)/);
});

test('later moves nothing and a used button does nothing', async () => {
  const ctx = setup();
  await ctx.agent.press('setup:20');
  const [yes, , later] = await pay(ctx, 'pay-a-0000000000000');
  await ctx.agent.press(later);
  await ctx.agent.press(yes);
  assert.equal(ctx.sent.length, 0);
  assert.match(ctx.messages.at(-1).text, /already been handled/);
});

test('too expensive is remembered and changes the next offer', async () => {
  const ctx = setup();
  await ctx.agent.press('network:mtn-data');
  await ctx.agent.askForData();
  assert.match(ctx.messages.at(-1).text, /most you want to spend/);
  await ctx.agent.press('budget:2000');
  assert.match(ctx.messages.at(-1).text, /6GB/);
  await ctx.agent.press('data:expensive:best');
  assert.match(ctx.messages.at(-1).text, /100MB/);
  assert.equal(ctx.bought.length, 0);
});

test('pays the plan price at most, and records only delivered bundles', async () => {
  const ctx = setup();
  await ctx.agent.press('network:mtn-data');
  await ctx.agent.press('budget:2000');
  await ctx.agent.press('data:buy:best');
  assert.equal(ctx.bought[0].max, 1.02);
  assert.match(ctx.bought[0].url, /buy?quote=q1/);
  assert.ok(ctx.events.some((event) => event.type === 'data_bought'));
});

test('never claims delivery when the bundle failed', async () => {
  const ctx = setup({ delivery: { status: 'failed', reason: 'TRANSACTION FAILED' } });
  await ctx.agent.press('network:mtn-data');
  await ctx.agent.press('budget:2000');
  await ctx.agent.press('data:buy:best');
  assert.match(ctx.messages.at(-1).text, /NOT delivered/);
  assert.ok(!ctx.events.some((event) => event.type === 'data_bought'));
});

test('offers all four networks and buys on the one chosen', async () => {
  const ctx = setup();
  await ctx.agent.press('setup:20');
  assert.deepEqual(ctx.lastButtons(), ['network:mtn-data', 'network:airtel-data', 'network:glo-data', 'network:etisalat-data']);
  await ctx.agent.press('network:etisalat-data');
  assert.match(ctx.messages.at(-1).text, /9mobile/);
  await ctx.agent.press('budget:2000');
  await ctx.agent.press('data:buy:best');
  assert.equal(ctx.quoteUrls.at(-1).includes('service=etisalat-data'), true);
});

test('asks for a new budget when no plan fits', async () => {
  const ctx = setup();
  await ctx.agent.press('network:mtn-data');
  await ctx.agent.press('budget:50');
  assert.match(ctx.messages.at(-1).text, /No plan fits N50/);
});

test('offers show the live rate and its source', async () => {
  const ctx = setup();
  await ctx.agent.press('network:mtn-data');
  await ctx.agent.press('budget:2000');
  assert.match(ctx.messages.at(-1).text, /N1500.00 per USDC (test/);
});

test('stop takes autopilot back', async () => {
  const ctx = setup();
  await ctx.agent.press('setup:20');
  await ctx.agent.press('saveauto:on');
  await ctx.agent.stopAutopilot();
  await ctx.agent.handlePay({ digest: 'pay-a-0000000000000', amount: 100 });
  assert.equal(ctx.sent.length, 0);
});

test('rejects a badly written bill', async () => {
  const ctx = setup();
  await ctx.agent.addBill('Rent fifty');
  assert.match(ctx.messages.at(-1).text, /write it like this/);
  await ctx.agent.addBill('Rent 50 28');
  assert.deepEqual(ctx.agent.state().bills, [{ name: 'Rent', amount: 50, day: 28 }]);
});
