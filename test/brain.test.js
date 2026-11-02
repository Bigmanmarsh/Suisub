import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TRUST_AFTER, billsDueSoon, emptyState, nextDataDue, parsePlan, pickPlan, planForPay,
  rebuildState, shouldOfferDataAuto, shouldOfferSaveAuto,
} from '../src/brain.js';

const at = (day) => `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const plans = [
  { variation_code: 'a', name: 'N100 100MB - 24 hrs', variation_amount: '100.00' },
  { variation_code: 'b', name: 'N1000 1.5GB - 30 days', variation_amount: '1000.00' },
  { variation_code: 'c', name: 'N1500 6GB - 7 days', variation_amount: '1500.00' },
  { variation_code: 'd', name: 'N2500 6GB - 30 days', variation_amount: '2500.00' },
  { variation_code: 'e', name: 'Mystery bundle', variation_amount: '50.00' },
];

test('asks for setup before it knows the savings rate', () => {
  assert.equal(planForPay(emptyState(), 100).action, 'ask_setup');
});

test('earns autopilot only after repeated approvals', () => {
  const events = [{ type: 'save_set', percent: 20, at: at(1) }];
  for (let i = 0; i < TRUST_AFTER - 1; i += 1) events.push({ type: 'save_approved', percent: 20, at: at(2 + i) });
  assert.equal(shouldOfferSaveAuto(rebuildState(events)), false);
  events.push({ type: 'save_approved', percent: 20, at: at(9) });
  assert.equal(shouldOfferSaveAuto(rebuildState(events)), true);
  assert.equal(planForPay(rebuildState(events), 100).action, 'ask_save');
  events.push({ type: 'save_auto_on', at: at(10) });
  assert.deepEqual(planForPay(rebuildState(events), 100), { action: 'auto_save', save: 20, percent: 20 });
});

test('a correction changes the rate and resets trust', () => {
  const state = rebuildState([
    { type: 'save_set', percent: 20, at: at(1) },
    { type: 'save_approved', percent: 20, at: at(2) },
    { type: 'save_auto_on', at: at(3) },
    { type: 'save_changed', percent: 30, at: at(4) },
  ]);
  assert.equal(state.savePercent, 30);
  assert.equal(state.saveStreak, 0);
  assert.equal(planForPay(state, 10).action, 'ask_save');
  assert.equal(planForPay(state, 10).save, 3);
});

test('rebuilding does not depend on the order memories come back in', () => {
  const state = rebuildState([
    { type: 'save_changed', percent: 30, at: at(4) },
    { type: 'save_set', percent: 20, at: at(1) },
  ]);
  assert.equal(state.savePercent, 30);
});

test('reads plan names and skips ones it cannot read', () => {
  assert.deepEqual(parsePlan(plans[1]), { code: 'b', name: plans[1].name, naira: 1000, mb: 1536, days: 30 });
  assert.equal(parsePlan(plans[0]).days, 1);
  assert.equal(parsePlan(plans[4]), null);
});

test('reads Glo and 9mobile plan names from the VTpass docs', () => {
  const read = (name) => parsePlan({ variation_code: 'x', name, variation_amount: '100.00' });
  assert.deepEqual([read('Glo Data N100 - 105MB - 2 day').mb, read('Glo Data N100 - 105MB - 2 day').days], [105, 2]);
  assert.equal(read('Glo Data N500 - 1.05GB - 14 days').days, 14);
  const nine = read('9mobile Data - 2000 Naira - 4.5GB Data - 30 Days');
  assert.deepEqual([nine.mb, nine.days], [4608, 30]);
  assert.deepEqual([read('9mobile Data - 100 Naira - 100MB - 1 day').mb, read('9mobile Data - 100 Naira - 100MB - 1 day').days], [100, 1]);
});

test('skips plans that only work for certain apps or hours', () => {
  const read = (name) => parsePlan({ variation_code: 'x', name, variation_amount: '450' });
  assert.equal(read('Glo TV VOD 2GB 7days Oneoff'), null);
  assert.equal(read('2GB Night plan - 7 days'), null);
  assert.ok(read('Glo Data N500 - 1.05GB - 14 days'));
});

test('reads plan lengths written as words, months and years', () => {
  const days = (name) => parsePlan({ variation_code: 'x', name, variation_amount: '100.00' })?.days;
  assert.equal(days('MTN N22000 120GB Monthly Plan + 80mins'), 30);
  assert.equal(days('MTN N50,000 400GB 3-Month Plan'), 90);
  assert.equal(days('MTN N100,000 1TB Mobile Data (1 Year)'), 365);
  assert.equal(parsePlan({ variation_code: 'x', name: '600 Naira Voice Bundle', variation_amount: '600' }), null);
});

test('picks the most data per naira, then respects what it learned', () => {
  assert.equal(pickPlan(emptyState(), plans).code, 'c');
  const tooExpensive = rebuildState([{ type: 'data_too_expensive', naira: 1500, at: at(1) }]);
  assert.equal(pickPlan(tooExpensive, plans).code, 'b');
  const likesMonthly = rebuildState([{ type: 'data_bought', naira: 2500, days: 30, at: at(1) }]);
  assert.equal(pickPlan(likesMonthly, plans).code, 'd');
});

test('returns no plan when nothing fits the cap', () => {
  const state = rebuildState([{ type: 'data_too_expensive', naira: 100, at: at(1) }]);
  assert.equal(pickPlan(state, plans), null);
});

test('predicts when data runs out from real purchase gaps', () => {
  const one = rebuildState([{ type: 'data_bought', naira: 100, days: 7, at: at(1) }]);
  assert.equal(nextDataDue(one).toISOString(), at(8));
  const two = rebuildState([
    { type: 'data_bought', naira: 100, days: 7, at: at(1) },
    { type: 'data_bought', naira: 100, days: 7, at: at(6) },
  ]);
  assert.equal(nextDataDue(two).toISOString(), at(11));
  assert.equal(nextDataDue(emptyState()), null);
});

test('data trust grows with purchases and is lost on a complaint', () => {
  const bought = [1, 2, 3].map((day) => ({ type: 'data_bought', naira: 100, days: 7, at: at(day) }));
  assert.equal(shouldOfferDataAuto(rebuildState(bought)), true);
  assert.equal(shouldOfferDataAuto(rebuildState([...bought, { type: 'data_too_expensive', naira: 100, at: at(4) }])), false);
});

test('finds bills due soon, including across a month end', () => {
  const state = rebuildState([
    { type: 'bill_added', name: 'Rent', amount: 50, day: 2, at: at(1) },
    { type: 'bill_added', name: 'Netflix', amount: 5, day: 20, at: at(1) },
  ]);
  const names = (now) => billsDueSoon(state, now).map((bill) => bill.name);
  assert.deepEqual(names(new Date(2026, 10, 1)), ['Rent']);
  assert.deepEqual(names(new Date(2026, 10, 30)), ['Rent']);
  assert.deepEqual(names(new Date(2026, 10, 10)), []);
});
