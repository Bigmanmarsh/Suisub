// The agent: decides what to say and do, using what it has learned.
import {
  billsDueSoon, nextDataDue, parsePlan, pickPlan, planForPay, rebuildState,
  shouldOfferDataAuto, shouldOfferSaveAuto,
} from './brain.js';
import { nairaToUsdc } from './shop.js';

const button = (text, data) => ({ text, data });
const SAVE_CHOICES = [10, 20, 30, 50];
const BUDGET_CHOICES = [500, 1000, 2000, 5000];
const PRICE_TOLERANCE = 0.02; // how far a shop quote may move above the price just shown
const percentRow = (prefix) => SAVE_CHOICES.map((percent) => button(`${percent}%`, `${prefix}:${percent}`));
const NETWORK_NAMES = { 'mtn-data': 'MTN', 'airtel-data': 'Airtel', 'glo-data': 'Glo', 'etisalat-data': '9mobile' };
const NETWORK_BUTTONS = [
  [button('MTN', 'network:mtn-data'), button('Airtel', 'network:airtel-data')],
  [button('Glo', 'network:glo-data'), button('9mobile', 'network:etisalat-data')],
];

export function createAgent({ memory, wallet, tatum, vtpassPlans, rates, shopUrl, config, notify, now = () => new Date(), fetchFn = fetch }) {
  const pendingPays = new Map();
  const pendingPlans = new Map();
  const seenPayments = new Set();
  const reminded = new Set();

  const state = () => rebuildState(memory.events());
  const learn = (type, fields = {}) => memory.record({ type, ...fields, at: now().toISOString() });

  async function moveToSavings(amount) {
    const digest = await wallet.sendUsdc(config.savingsAddress, amount);
    return digest;
  }

  async function offerSaveAutoIfEarned() {
    const current = state();
    if (!shouldOfferSaveAuto(current)) return;
    await notify(
      `You've approved saving ${current.savePercent}% ${current.saveStreak} times in a row. Want me to do this by myself from now on? I'll still tell you each time.`,
      [[button('Yes, do it by yourself', 'saveauto:on'), button('Keep asking me', 'saveauto:off')]],
    );
  }

  async function offerDataAutoIfEarned(naira) {
    if (!shouldOfferDataAuto(state())) return;
    await notify(
      `That's ${state().data.streak} data purchases in a row. Want me to renew by myself, up to N${naira}?`,
      [[button(`Yes, up to N${naira}`, `dataauto:on:${naira}`), button('Keep asking me', 'dataauto:off')]],
    );
  }

  async function buyPlan(plan) {
    const { service } = state().data;
    const { rate } = await rates.current();
    const limit = Number(nairaToUsdc(plan.naira, rate)) * (1 + PRICE_TOLERANCE);
    const quoteResponse = await fetchFn(`${shopUrl}/quote?service=${service}&plan=${encodeURIComponent(plan.code)}`);
    if (!quoteResponse.ok) throw new Error(`Shop could not price this plan (HTTP ${quoteResponse.status})`);
    const quote = await quoteResponse.json();
    const result = await wallet.buyBundle(`${shopUrl}/buy?quote=${quote.quote}`, limit);
    const delivery = result.body.delivery ?? { status: 'failed', reason: `Shop returned ${result.status}` };
    if (delivery.status === 'delivered') {
      learn('data_bought', { naira: plan.naira, days: plan.days });
      return { ...delivery, digest: result.digest };
    }
    return { ...delivery, digest: result.digest };
  }

  function deliveryMessage(plan, delivery) {
    if (delivery.status === 'delivered') return `Done. ${plan.name} is on your line.\nPayment: ${delivery.digest}`;
    if (delivery.status === 'pending') return `Paid, and VTpass says ${plan.name} is still pending. Check your line, and I'll keep the reference: ${delivery.requestId}`;
    return `Your payment went through, but the bundle was NOT delivered (${delivery.reason}). Payment: ${delivery.digest ?? 'not sent'}`;
  }

  async function bestPlan() {
    const current = state();
    if (!current.data.service) return null;
    return pickPlan(current, await vtpassPlans(current.data.service));
  }

  return {
    state,
    address: wallet.address,

    async start() {
      const current = state();
      if (current.savePercent !== null) {
        return this.status();
      }
      await notify(
        "Hi! I look after the money you get paid in USDC. First: how much of each payment should go to savings?",
        [percentRow('setup')],
      );
    },

    async status() {
      const current = state();
      const lines = [
        `Savings: ${current.savePercent ?? '?'}% of each payment (${current.saveAuto ? 'by myself' : 'I ask first'})`,
        `Data: ${NETWORK_NAMES[current.data.service] ?? 'not set'} (${current.data.auto ? `by myself, up to N${current.data.autoLimitNaira}` : 'I ask first'})`,
      ];
      if (current.data.maxNaira !== null) lines.push(`Price limit you taught me: N${current.data.maxNaira}`);
      const due = nextDataDue(current);
      if (due) lines.push(`Data probably runs out: ${due.toDateString()}`);
      for (const bill of current.bills) lines.push(`Bill: ${bill.name}, ${bill.amount}, day ${bill.day}`);
      const balance = await tatum.usdcBalance(wallet.address).catch(() => null);
      lines.push(`Agent wallet: ${balance === null ? 'balance unavailable' : `${balance} USDC`}`);
      lines.push(`Send pay to: ${wallet.address}`);
      await notify(lines.join('\n'));
    },

    async addBill(text) {
      const match = text.trim().match(/^(.+?)\s+([\d.]+)\s+(\d{1,2})$/);
      const day = match ? Number(match[3]) : 0;
      if (!match || day < 1 || day > 31) {
        await notify('Please write it like this: /bill Rent 50 28 (name, amount, day of the month).');
        return;
      }
      learn('bill_added', { name: match[1], amount: Number(match[2]), day });
      await notify(`Got it. I'll remind you about ${match[1]} before day ${day} each month.`);
    },

    async checkPayments() {
      const payments = await tatum.incomingPayments(wallet.address);
      for (const payment of payments) {
        if (seenPayments.has(payment.digest)) continue;
        seenPayments.add(payment.digest);
        await this.handlePay(payment);
      }
    },

    // Marks payments that happened before this run, so a restart doesn't alert twice.
    async skipOldPayments() {
      const payments = await tatum.incomingPayments(wallet.address);
      payments.forEach((payment) => seenPayments.add(payment.digest));
    },

    async handlePay(payment) {
      const plan = planForPay(state(), payment.amount);
      if (plan.action === 'ask_setup') {
        await notify(`${payment.amount} USDC just landed. Tell me how much to save:`, [percentRow('setup')]);
        return;
      }
      if (plan.action === 'auto_save') {
        try {
          const digest = await moveToSavings(plan.save);
          await notify(`${payment.amount} USDC just landed. I saved ${plan.save} USDC (${plan.percent}%), as you asked me to.\nPayment: ${digest}`);
        } catch (error) {
          await notify(`${payment.amount} USDC landed, but I couldn't save ${plan.save} USDC: ${error.message}`);
        }
        return;
      }
      pendingPays.set(payment.digest.slice(0, 16), plan.save);
      const id = payment.digest.slice(0, 16);
      await notify(
        `${payment.amount} USDC just landed. Your usual: save ${plan.save} USDC (${plan.percent}%). OK?`,
        [[button('Yes', `save:yes:${id}`), button('Change', `save:change:${id}`), button('Later', `save:later:${id}`)]],
      );
    },

    // Checks bills and data. Safe to call often: each reminder goes out once.
    async dailyCheck() {
      const today = now();
      const current = state();
      const dayKey = today.toISOString().slice(0, 10);
      for (const bill of billsDueSoon(current, today)) {
        const key = `${bill.name}-${today.getFullYear()}-${today.getMonth()}`;
        if (reminded.has(key)) continue;
        reminded.add(key);
        await notify(`Reminder: ${bill.name} (${bill.amount}) is due on day ${bill.day}.`);
      }
      const due = nextDataDue(current);
      if (!due || due.getTime() - today.getTime() > 86400000 || reminded.has(`data-${dayKey}`)) return;
      reminded.add(`data-${dayKey}`);
      const plan = await bestPlan();
      if (!plan) return;
      if (current.data.auto && plan.naira <= current.data.autoLimitNaira) {
        const delivery = await buyPlan(plan);
        await notify(`Your data was about to run out, so I renewed it by myself.\n${deliveryMessage(plan, delivery)}`);
        return;
      }
      await this.offerPlan(plan, 'Your data is about to run out.');
    },

    async offerPlan(plan, intro) {
      pendingPlans.set(plan.code, plan);
      const { rate, source } = await rates.current();
      const usdc = nairaToUsdc(plan.naira, rate);
      await notify(
        `${intro} Best deal I found on VTpass for you: ${plan.name}.\nAbout ${usdc} USDC at N${rate.toFixed(2)} per USDC (${source}, includes a small margin). Buy it?`,
        [[button('Buy', `data:buy:${plan.code}`), button('Too expensive', `data:expensive:${plan.code}`)]],
      );
    },

    async chooseNetwork() {
      await notify('Which network is your line on?', NETWORK_BUTTONS);
    },

    async askForData() {
      if (!state().data.service) {
        await notify('Which network is your line on?', NETWORK_BUTTONS);
        return;
      }
      const { maxNaira } = state().data;
      const plan = maxNaira === null ? null : await bestPlan();
      if (!plan) {
        const intro = maxNaira === null ? 'What is the most you want to spend on a data plan?' : `No plan fits N${maxNaira}. What should your new budget be?`;
        await notify(intro, [BUDGET_CHOICES.map((naira) => button(`N${naira}`, `budget:${naira}`))]);
        return;
      }
      await this.offerPlan(plan, 'Here you go.');
    },

    // Handles a button press. Returns nothing; replies go through notify.
    async press(data) {
      const [kind, value, extra] = data.split(':');
      switch (kind) {
        case 'setup':
          learn('save_set', { percent: Number(value) });
          await notify(`Saved: ${value}% of each payment. Which network is your line on?`, NETWORK_BUTTONS);
          return;
        case 'network':
          learn('data_network_set', { service: value });
          await notify(`Got it: ${NETWORK_NAMES[value]}. Add your monthly bills like this: /bill Rent 50 28\nUse /data to buy data, and /status to see what I know.`);
          return;
        case 'budget':
          learn('data_budget_set', { naira: Number(value) });
          return this.askForData();
        case 'save':
          return this.pressSave(value, extra);
        case 'savepercent': {
          const save = pendingPays.get(extra);
          learn('save_changed', { percent: Number(value) });
          await notify(`I'll remember ${value}% from now on.`);
          if (save !== undefined) await this.settleChangedPay(extra, Number(value));
          return;
        }
        case 'saveauto':
          if (value === 'on') {
            learn('save_auto_on');
            await notify("Done. From now on I'll save by myself and tell you each time. Use /stop to take this back.");
          } else {
            learn('save_auto_off');
            await notify("No problem. I'll keep asking.");
          }
          return;
        case 'data':
          return this.pressData(value, extra);
        case 'dataauto':
          if (value === 'on') {
            learn('data_auto_on', { limitNaira: Number(extra) });
            await notify(`Done. I'll renew by myself up to N${extra}. Use /stop to take this back.`);
          } else {
            learn('data_auto_off');
            await notify("No problem. I'll keep asking.");
          }
          return;
        default:
          await notify("Sorry, that button isn't active any more.");
      }
    },

    async pressSave(choice, id) {
      const save = pendingPays.get(id);
      if (save === undefined) {
        await notify('That payment has already been handled.');
        return;
      }
      if (choice === 'later') {
        pendingPays.delete(id);
        await notify("OK, nothing moved. Ask me whenever you're ready.");
        return;
      }
      if (choice === 'change') {
        await notify('How much should I save from now on?', [percentRow(`savepercent`).map((b) => button(b.text, `${b.data}:${id}`))]);
        return;
      }
      pendingPays.delete(id);
      try {
        const digest = await moveToSavings(save);
        learn('save_approved', { percent: state().savePercent });
        await notify(`Saved ${save} USDC.\nPayment: ${digest}`);
        await offerSaveAutoIfEarned();
      } catch (error) {
        pendingPays.set(id, save);
        await notify(`I couldn't confirm that saving went through (${error.message}). Check /status before tapping Yes again.`);
      }
    },

    async settleChangedPay(id, percent) {
      const oldSave = pendingPays.get(id);
      pendingPays.delete(id);
      const oldPercent = rebuildState(memory.events().slice(0, -1)).savePercent;
      const save = Math.floor((oldSave / oldPercent) * percent * 1e6) / 1e6;
      try {
        const digest = await moveToSavings(save);
        await notify(`Saved ${save} USDC.\nPayment: ${digest}`);
      } catch (error) {
        await notify(`I couldn't save that: ${error.message}`);
      }
    },

    async pressData(choice, code) {
      const plan = pendingPlans.get(code);
      if (!plan) {
        await notify('That offer has expired. Use /data for a fresh one.');
        return;
      }
      pendingPlans.delete(code);
      if (choice === 'expensive') {
        learn('data_too_expensive', { naira: plan.naira });
        await notify(`Noted. I won't suggest N${plan.naira} or more again.`);
        await this.askForData();
        return;
      }
      try {
        const delivery = await buyPlan(plan);
        await notify(deliveryMessage(plan, delivery));
        if (delivery.status === 'delivered') await offerDataAutoIfEarned(plan.naira);
      } catch (error) {
        await notify(`I couldn't buy that, and no bundle was delivered: ${error.message}`);
      }
    },

    async stopAutopilot() {
      const current = state();
      if (current.saveAuto) learn('save_auto_off');
      if (current.data.auto) learn('data_auto_off');
      await notify("Autopilot is off. I'll ask before doing anything.");
    },

    planFromRaw: parsePlan,
  };
}
