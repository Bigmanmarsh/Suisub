// Checks the VTpass connection: plan lists for each network and how well we can read them.
// In sandbox mode only, also places one test order on VTpass's test number.
import { parsePlan, pickPlan, emptyState } from '../src/brain.js';
import { loadConfig } from '../src/config.js';
import { createVtpass } from '../src/vtpass.js';

const config = loadConfig();
const vtpass = createVtpass(config.vtpass);
const sandbox = config.vtpass.baseUrl.includes('sandbox');
console.log(`Mode: ${sandbox ? 'sandbox' : 'live'}`);

for (const service of ['mtn-data', 'airtel-data', 'glo-data', 'etisalat-data']) {
  try {
    const plans = await vtpass.plans(service);
    const unread = plans.filter((plan) => !parsePlan(plan));
    const state = emptyState();
    state.data.maxNaira = 1000;
    const best = pickPlan(state, plans);
    console.log(`${service}: ${plans.length} plans, ${unread.length} unreadable. Best value up to N1000: ${best?.name} (N${best?.naira})`);
    unread.slice(0, 4).forEach((plan) => console.log(`  cannot read: ${plan.name}`));
  } catch (error) {
    console.log(`${service}: ${error.message}`);
  }
}

if (sandbox) {
  const [plan] = await vtpass.plans('mtn-data');
  const order = await vtpass.buy({ service: 'mtn-data', planCode: plan.variation_code, phone: '08011111111' });
  console.log(`Test order for ${plan.name}: ${order.status}${order.reason ? ` (${order.reason})` : ''}`);
}
