import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState, estimateMonthlyMb, rebuildState, suggestPlans } from '../src/brain.js';

const at = (day) => `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const plan = (code, name, naira) => ({ variation_code: code, name, variation_amount: String(naira) });
const PLANS = [
  plan('day', 'N600 2.5GB - 2 days', 600),
  plan('small', 'N1000 1.5GB - 30 days', 1000),
  plan('mid', 'N2500 6GB - 30 days', 2500),
  plan('big', 'N3500 14GB - 30 days', 3500),
  plan('huge', 'N7000 40GB - 30 days', 7000),
  plan('year', 'N50000 400GB - 1 Year', 50000),
];

test('no usage known means no estimate', () => {
  assert.equal(estimateMonthlyMb(emptyState()), null);
});

test('suggests the cheapest plan per day that covers monthly use', () => {
  const { recommended } = suggestPlans(rebuildState([{ type: 'data_usage_set', gb: 10, at: at(1) }]), PLANS);
  assert.equal(recommended.code, 'big');
});

test('always gives a cheaper and a bigger choice when they exist', () => {
  const { cheaper, bigger } = suggestPlans(rebuildState([{ type: 'data_usage_set', gb: 10, at: at(1) }]), PLANS);
  assert.equal(cheaper.code, 'mid');
  assert.equal(bigger.code, 'huge');
});

test('light users get a light plan, and there may be nothing cheaper', () => {
  const light = rebuildState([{ type: 'data_usage_set', gb: 1, at: at(1) }]);
  const { recommended } = suggestPlans(light, PLANS);
  assert.equal(recommended.code, 'small');
});

test('never suggests a year-long plan as everyday data', () => {
  const heavy = rebuildState([{ type: 'data_usage_set', gb: 100, at: at(1) }]);
  const { recommended, bigger } = suggestPlans(heavy, PLANS);
  assert.equal(recommended.code, 'huge');
  assert.equal(bigger, null);
});

test('running out raises the estimate and the suggestion', () => {
  const events = [{ type: 'data_usage_set', gb: 5, at: at(1) }];
  assert.equal(suggestPlans(rebuildState(events), PLANS).recommended.code, 'mid');
  events.push({ type: 'data_ran_out', at: at(2) });
  assert.equal(estimateMonthlyMb(rebuildState(events)), 5 * 1024 * 1.25);
  assert.equal(suggestPlans(rebuildState(events), PLANS).recommended.code, 'big');
  events.push({ type: 'data_left_over', at: at(3) });
  assert.equal(estimateMonthlyMb(rebuildState(events)), 5 * 1024);
});

test('real purchases replace what the user said once there is enough history', () => {
  const said = { type: 'data_usage_set', gb: 50, at: at(1) };
  const buy = (day, mb) => ({ type: 'data_bought', naira: 100, days: 7, mb, at: at(day) });
  assert.equal(estimateMonthlyMb(rebuildState([said, buy(1, 3072), buy(4, 3072)])), 50 * 1024);
  assert.equal(estimateMonthlyMb(rebuildState([said, buy(1, 3072), buy(11, 3072)])), 9216);
});

test('a price cap applies to every option', () => {
  const state = rebuildState([
    { type: 'data_usage_set', gb: 10, at: at(1) },
    { type: 'data_too_expensive', naira: 3500, at: at(2) },
  ]);
  const options = suggestPlans(state, PLANS);
  assert.equal(options.recommended.code, 'mid');
  assert.equal(options.bigger, null);
});

test('without a usage estimate it falls back to best value within budget', () => {
  const state = rebuildState([{ type: 'data_budget_set', naira: 2500, at: at(1) }]);
  assert.equal(suggestPlans(state, PLANS).recommended.code, 'mid');
});
