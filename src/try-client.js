// Runs in the visitor's browser: the agent's real learning code (/brain.js) on a copy of
// its memories. Every button adds an event, exactly as the Telegram bot would.
import { estimateMonthlyMb, planForPay, rebuildState, shouldOfferSaveAuto, suggestPlans } from '/brain.js';

const { events: realEvents, plans } = await (await fetch('/try-data.json')).json();
let events = [];
let pendingSave = null;

const $ = (id) => document.getElementById(id);
const gb = (mb) => `${Math.round((mb / 1024) * 10) / 10}GB`;
const state = () => rebuildState(events);
let clock = Date.now();
const add = (type, fields = {}) => events.push({ type, ...fields, at: new Date((clock += 1000)).toISOString() });

function say(text) {
  const item = document.createElement('li');
  item.textContent = text;
  $('log').prepend(item);
}

function options() {
  const current = state();
  if (!current.data.service) current.data.service = 'mtn-data';
  return suggestPlans(current, plans);
}

function render() {
  const current = state();
  const monthly = estimateMonthlyMb(current);
  const { recommended } = options();
  const lines = [
    current.savePercent === null ? 'Doesn\'t know your savings rate' : `Saves ${current.savePercent}% of each payment, ${current.saveAuto ? 'by itself' : 'after asking'}`,
    monthly === null ? 'Doesn\'t know your data use' : `Thinks you use about ${gb(monthly)} a month`,
    current.data.maxNaira === null ? null : `Won't suggest data over N${current.data.maxNaira}`,
    recommended ? `Would suggest: ${recommended.name}` : 'No plan fits what it knows',
    `Memories: ${events.length}`,
  ].filter(Boolean);
  $('now').replaceChildren(...lines.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
}

const actions = {
  pay() {
    if (state().savePercent === null) add('save_set', { percent: 50 });
    const plan = planForPay(state(), 100);
    if (plan.action === 'auto_save') {
      say(`100 USDC landed. I saved ${plan.save} USDC by myself, as you allowed.`);
    } else {
      pendingSave = plan;
      say(`100 USDC landed. Your usual: save ${plan.save} USDC (${plan.percent}%). OK?`);
    }
  },
  approve() {
    if (!pendingSave) return say('Nothing to approve yet. Tap "100 USDC lands" first.');
    add('save_approved', { percent: pendingSave.percent });
    pendingSave = null;
    say('Saved. I remembered that you approved.');
    if (shouldOfferSaveAuto(state())) {
      add('save_auto_on');
      say('That\'s 3 approvals in a row, so I offered to save by myself, and in this sandbox you said yes.');
    }
  },
  rate() {
    add('save_changed', { percent: 30 });
    say('I\'ll save 30% from now on, and I\'ll ask first again until you trust the new rate.');
  },
  ranout() {
    if (estimateMonthlyMb(state()) === null) add('data_usage_set', { gb: 5 });
    add('data_ran_out');
    say(`Noted. I now estimate about ${gb(estimateMonthlyMb(state()))} a month.`);
  },
  left() {
    if (estimateMonthlyMb(state()) === null) add('data_usage_set', { gb: 5 });
    add('data_left_over');
    say(`Noted. I now estimate about ${gb(estimateMonthlyMb(state()))} a month.`);
  },
  buy() {
    const { recommended } = options();
    if (!recommended) return say('No plan fits what I know.');
    add('data_bought', { naira: recommended.naira, days: recommended.days, mb: recommended.mb });
    say(`Bought ${recommended.name} (sandbox: nothing was paid). I'll prefer ${recommended.days}-day plans now.`);
  },
  expensive() {
    const { recommended } = options();
    if (!recommended) return say('No plan to judge.');
    add('data_too_expensive', { naira: recommended.naira });
    say(`Noted. I won't suggest N${recommended.naira} or more again.`);
  },
};

document.addEventListener('click', (event) => {
  const start = event.target.dataset.start;
  const act = event.target.dataset.act;
  if (start) {
    events = start === 'real' ? [...realEvents] : [];
    pendingSave = null;
    $('log').replaceChildren();
    say(start === 'real' ? `Loaded ${events.length} real memories from the owner's agent.` : 'Started with no memory at all.');
  } else if (act?.startsWith('usage:')) {
    add('data_usage_set', { gb: Number(act.split(':')[1]) });
    say(`Got it: about ${act.split(':')[1]}GB a month.`);
  } else if (act) {
    actions[act]();
  } else {
    return;
  }
  render();
});

events = [...realEvents];
say(`Loaded ${events.length} real memories from the owner's agent. Try the buttons, or start with no memory to compare.`);
render();
