// The agent's learning logic. No network here: it turns memories into behaviour.
// Every lesson is a plain event, so the state can be rebuilt from Walrus at any time.

export const TRUST_AFTER = 3; // approvals in a row before the agent asks for autopilot
const RAN_OUT_FACTOR = 1.25; // "I ran out early" raises the usage estimate
const LEFT_OVER_FACTOR = 0.8; // "I had data left" lowers it
const MIN_HISTORY_DAYS = 7; // purchases must span this long before they replace what the user said
const MAX_SUGGESTED_DAYS = 31; // a year-long plan is never the everyday suggestion
const FULL_MONTH_DAYS = 28; // plans this long are treated as lasting the month

export function emptyState() {
  return {
    savePercent: null,
    saveStreak: 0,
    saveAuto: false,
    bills: [],
    data: {
      service: null,
      maxNaira: null,
      preferredDays: null,
      usageMb: null,
      usageAdjust: 1,
      purchases: [],
      streak: 0,
      auto: false,
      autoLimitNaira: null,
    },
  };
}

// Applies one remembered event to the state. Unknown events are ignored.
export function applyEvent(state, event) {
  const { data } = state;
  switch (event.type) {
    case 'save_set':
      state.savePercent = event.percent;
      state.saveStreak = 0;
      break;
    case 'save_approved':
      state.saveStreak += 1;
      break;
    case 'save_changed':
      state.savePercent = event.percent;
      state.saveStreak = 0;
      state.saveAuto = false;
      break;
    case 'save_auto_on':
      state.saveAuto = true;
      break;
    case 'save_auto_off':
      state.saveAuto = false;
      state.saveStreak = 0;
      break;
    case 'bill_added':
      state.bills = state.bills.filter((bill) => bill.name !== event.name);
      state.bills.push({ name: event.name, amount: event.amount, day: event.day });
      break;
    case 'data_network_set':
      data.service = event.service;
      break;
    case 'data_bought':
      data.purchases.push({ at: event.at, naira: event.naira, days: event.days, mb: event.mb ?? 0 });
      data.preferredDays = event.days;
      data.streak += 1;
      break;
    case 'data_budget_set':
      data.maxNaira = event.naira;
      break;
    case 'data_usage_set':
      data.usageMb = event.gb * 1024;
      data.usageAdjust = 1;
      break;
    case 'data_ran_out':
      data.usageAdjust *= RAN_OUT_FACTOR;
      break;
    case 'data_left_over':
      data.usageAdjust *= LEFT_OVER_FACTOR;
      break;
    case 'data_too_expensive':
      data.maxNaira = event.naira - 1;
      data.streak = 0;
      data.auto = false;
      break;
    case 'data_auto_on':
      data.auto = true;
      data.autoLimitNaira = event.limitNaira;
      break;
    case 'data_auto_off':
      data.auto = false;
      data.streak = 0;
      break;
  }
  return state;
}

export function rebuildState(events) {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return ordered.reduce(applyEvent, emptyState());
}

// What to do when pay lands: act alone only if the user has granted autopilot.
export function planForPay(state, amountUsdc) {
  if (state.savePercent === null) return { action: 'ask_setup' };
  const save = Math.floor(amountUsdc * state.savePercent * 10000) / 1000000;
  return { action: state.saveAuto ? 'auto_save' : 'ask_save', save, percent: state.savePercent };
}

export function shouldOfferSaveAuto(state) {
  return !state.saveAuto && state.saveStreak >= TRUST_AFTER;
}

export function shouldOfferDataAuto(state) {
  return !state.data.auto && state.data.streak >= TRUST_AFTER;
}

// Reads "N1000 1.5GB - 30 days" style plan names. Returns null if it can't.
export function parsePlan(plan) {
  const size = plan.name.match(/([\d.]+)\s*(GB|MB|TB)/i);
  const days = planDays(plan.name);
  if (!size || days === null || RESTRICTED_PLAN.test(plan.name)) return null;
  const toMb = { MB: 1, GB: 1024, TB: 1024 * 1024 }[size[2].toUpperCase()];
  return {
    code: plan.variation_code,
    name: plan.name,
    naira: Number(plan.variation_amount),
    mb: Number(size[1]) * toMb,
    days,
  };
}

// Plans that only work for certain apps or hours, so they aren't real general data.
const RESTRICTED_PLAN = /\b(tv|vod|night|social|youtube|whatsapp|instagram|tiktok|facebook|opera|voice)\b/i;
const UNIT_DAYS = { h: 1 / 24, d: 1, w: 7, m: 30, y: 365 };
const WORD_DAYS = { daily: 1, weekly: 7, monthly: 30 };

function planDays(name) {
  const time = name.match(/(\d+)\s*[- ]?\s*(hrs?|hours?|days?|weeks?|months?|years?)\b/i);
  if (time) return Number(time[1]) * UNIT_DAYS[time[2][0].toLowerCase()];
  const word = name.match(/\b(daily|weekly|monthly)\b/i);
  return word ? WORD_DAYS[word[1].toLowerCase()] : null;
}

// The best deal: most data per naira, within the learned price cap and plan length.
export function pickPlan(state, rawPlans) {
  const { maxNaira, preferredDays } = state.data;
  const plans = rawPlans
    .map(parsePlan)
    .filter(Boolean)
    .filter((plan) => maxNaira === null || plan.naira <= maxNaira);
  const sameLength = plans.filter((plan) => preferredDays !== null && plan.days === preferredDays);
  const pool = sameLength.length > 0 ? sameLength : plans;
  return pool.sort((a, b) => b.mb / b.naira - a.mb / a.naira)[0] ?? null;
}

// Estimated monthly use. The app can't see the phone's usage, so this comes from what the
// user said, what they actually bought, and whether they ran out or had data left.
export function estimateMonthlyMb(state) {
  const { purchases, usageMb, usageAdjust } = state.data;
  const dayMs = 86400000;
  let base = usageMb;
  if (purchases.length >= 2 && purchases.every((purchase) => purchase.mb > 0)) {
    const first = Date.parse(purchases[0].at);
    const last = Date.parse(purchases[purchases.length - 1].at);
    const days = (last - first) / dayMs;
    if (days >= MIN_HISTORY_DAYS) {
      const used = purchases.slice(0, -1).reduce((sum, purchase) => sum + purchase.mb, 0);
      base = (used / days) * 30;
    }
  }
  return base === null ? null : base * usageAdjust;
}

// A suggested plan, plus a cheaper and a bigger choice. Without a usage estimate it falls
// back to the best value. Any choice may be missing if no plan fits.
export function suggestPlans(state, rawPlans) {
  const { maxNaira, preferredDays } = state.data;
  const plans = rawPlans
    .map(parsePlan)
    .filter(Boolean)
    .filter((plan) => plan.days <= MAX_SUGGESTED_DAYS)
    .filter((plan) => maxNaira === null || plan.naira <= maxNaira);
  const monthly = estimateMonthlyMb(state);
  const fullMonth = plans.filter((plan) => plan.days >= FULL_MONTH_DAYS);
  const cheapest = (list) => [...list].sort((a, b) => a.naira - b.naira)[0] ?? null;
  let recommended = null;
  if (monthly === null) {
    const pool = preferredDays === null && fullMonth.length > 0 ? fullMonth : plans;
    recommended = pickPlan(state, pool.map(toRawPlan));
  } else {
    const daily = monthly / 30;
    const covers = (plan) => plan.mb >= daily * plan.days;
    const sameLength = plans.filter((plan) => plan.days === preferredDays && covers(plan));
    // Order of preference: the length they keep buying, a plan that lasts the month, the
    // biggest month-long plan they can afford, then whatever short plan covers them.
    recommended = cheapest(sameLength)
      ?? cheapest(fullMonth.filter(covers))
      ?? [...fullMonth].sort((a, b) => b.mb - a.mb)[0]
      ?? [...plans].filter(covers).sort((a, b) => a.naira / a.days - b.naira / b.days)[0]
      ?? [...plans].sort((a, b) => b.mb - a.mb)[0]
      ?? null;
  }
  if (!recommended) return { recommended: null, cheaper: null, bigger: null };
  // The next step down and up, keeping a similar length so the choices are comparable.
  const similar = plans.filter((plan) => plan.days >= recommended.days);
  const cheaper = [...similar]
    .filter((plan) => plan.naira < recommended.naira)
    .sort((a, b) => b.naira - a.naira)[0] ?? null;
  const bigger = cheapest(similar.filter((plan) => plan.naira > recommended.naira && plan.mb > recommended.mb));
  return { recommended, cheaper, bigger };
}

function toRawPlan(plan) {
  return { variation_code: plan.code, name: plan.name, variation_amount: plan.naira };
}

// When data should run out next: the plan's length, or the learned gap between purchases.
export function nextDataDue(state) {
  const { purchases } = state.data;
  if (purchases.length === 0) return null;
  const times = purchases.map((purchase) => Date.parse(purchase.at));
  const last = times[times.length - 1];
  const dayMs = 86400000;
  if (times.length === 1) return new Date(last + purchases[0].days * dayMs);
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  return new Date(last + gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
}

// Bills due within the next `days` days of the month.
export function billsDueSoon(state, now, days = 2) {
  const inMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return state.bills.filter((bill) => {
    const day = Math.min(bill.day, inMonth);
    const gap = (day - now.getDate() + inMonth) % inMonth;
    return gap <= days;
  });
}

// Plain-English sentence stored with each event, so memories are readable and searchable.
export function describeEvent(event) {
  switch (event.type) {
    case 'save_set': return `User wants to save ${event.percent}% of each payment.`;
    case 'save_approved': return `User approved saving ${event.percent}% of a payment.`;
    case 'save_changed': return `User changed their savings rate to ${event.percent}%.`;
    case 'save_auto_on': return 'User allowed the agent to save automatically.';
    case 'save_auto_off': return 'User turned off automatic saving.';
    case 'bill_added': return `User has a monthly bill: ${event.name}, ${event.amount}, due on day ${event.day}.`;
    case 'data_network_set': return `User's data network is ${event.service}.`;
    case 'data_bought': return `User bought a ${event.days}-day data plan for N${event.naira}.`;
    case 'data_usage_set': return `User says they use about ${event.gb}GB of data a month.`;
    case 'data_ran_out': return 'User ran out of data early, so they need more than estimated.';
    case 'data_left_over': return 'User had data left over, so they need less than estimated.';
    case 'data_budget_set': return `User's budget for a data plan is N${event.naira}.`;
    case 'data_too_expensive': return `User said N${event.naira} is too expensive for data.`;
    case 'data_auto_on': return `User allowed automatic data purchases up to N${event.limitNaira}.`;
    case 'data_auto_off': return 'User turned off automatic data purchases.';
    default: return `Agent event: ${event.type}.`;
  }
}
