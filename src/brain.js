// The agent's learning logic. No network here: it turns memories into behaviour.
// Every lesson is a plain event, so the state can be rebuilt from Walrus at any time.

export const TRUST_AFTER = 3; // approvals in a row before the agent asks for autopilot

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
      data.purchases.push({ at: event.at, naira: event.naira, days: event.days });
      data.preferredDays = event.days;
      data.streak += 1;
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
  const time = plan.name.match(/(\d+)\s*[- ]?\s*(hrs?|hours?|days?|weeks?|months?)/i);
  if (!size || !time) return null;
  const toMb = { MB: 1, GB: 1024, TB: 1024 * 1024 }[size[2].toUpperCase()];
  const unit = time[2].toLowerCase();
  const toDays = unit.startsWith('h') ? 1 / 24 : unit.startsWith('d') ? 1 : unit.startsWith('w') ? 7 : 30;
  return {
    code: plan.variation_code,
    name: plan.name,
    naira: Number(plan.variation_amount),
    mb: Number(size[1]) * toMb,
    days: Number(time[1]) * toDays,
  };
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
    case 'data_too_expensive': return `User said N${event.naira} is too expensive for data.`;
    case 'data_auto_on': return `User allowed automatic data purchases up to N${event.limitNaira}.`;
    case 'data_auto_off': return 'User turned off automatic data purchases.';
    default: return `Agent event: ${event.type}.`;
  }
}
