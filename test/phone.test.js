import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAgent } from '../src/agent.js';
import { maskPhone, normalizePhone, phoneStore } from '../src/phone.js';

test('accepts common Nigerian formats and rejects the rest', () => {
  assert.equal(normalizePhone('0803 123 4567'), '08031234567');
  assert.equal(normalizePhone('+234 803 123 4567'), '08031234567');
  assert.equal(normalizePhone('2348031234567'), '08031234567');
  assert.equal(normalizePhone('0703-123-4567'), '07031234567');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('0603 123 4567'), null);
  assert.equal(normalizePhone(''), null);
});

test('masks the number when showing it', () => {
  assert.equal(maskPhone('08031234567'), '0803****567');
});

test('the number is kept in a local file across restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phone-'));
  const file = join(dir, 'phone.json');
  phoneStore(file).set('08031234567');
  assert.equal(phoneStore(file).get(), '08031234567');
  assert.equal(phoneStore(join(dir, 'none.json'), '08011111111').get(), '08011111111');
  rmSync(dir, { recursive: true });
});

test('/phone saves locally, never as a memory, and buying needs a number', async () => {
  const events = [];
  const messages = [];
  let saved = null;
  let paid = 0;
  const agent = createAgent({
    memory: { events: () => [...events], record: (event) => events.push(event) },
    wallet: { address: '0xagent', buyBundle: async () => { paid += 1; return { status: 200, body: {} }; } },
    tatum: { usdcBalance: async () => 1 },
    vtpassPlans: async () => [{ variation_code: 'p', name: 'N1000 1.5GB - 30 days', variation_amount: '1000' }],
    rates: { current: async () => ({ rate: 1500, source: 'test' }) },
    phone: { get: () => saved, set: (value) => { saved = value; } },
    fetchFn: async () => Response.json({ quote: 'q' }),
    shopUrl: 'http://shop',
    config: {},
    notify: async (text) => { messages.push(text); },
  });

  await agent.press('network:mtn-data');
  await agent.press('budget:2000');
  await agent.press('data:buy:p');
  assert.equal(paid, 0);
  assert.match(messages.at(-1), /no phone number is set/);

  await agent.setPhone('hello');
  assert.equal(saved, null);
  await agent.setPhone('0803 123 4567');
  assert.equal(saved, '08031234567');
  assert.match(messages.at(-1), /0803\*\*\*\*567/);
  assert.ok(!events.some((event) => JSON.stringify(event).includes('0803')));
});
