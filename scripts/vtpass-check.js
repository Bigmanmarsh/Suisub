// Checks the VTpass connection: plan lists for each network and what the agent would offer.
// In sandbox mode only, also places one test order on VTpass's test number.
import { parsePlan, rebuildState, suggestPlans } from '../src/brain.js';
import { loadConfig } from '../src/config.js';
import { createVtpass } from '../src/vtpass.js';

const config = loadConfig();
const vtpass = createVtpass(config.vtpass);
const sandbox = config.vtpass.baseUrl.includes('sandbox');
console.log(`Mode: ${sandbox ? 'sandbox' : 'live'}`);

for (const service of ['mtn-data', 'airtel-data', 'glo-data', 'etisalat-data']) {
  try {
    const plans = await vtpass.plans(service);
    const unread = plans.filter((plan) => !parsePlan(plan)).length;
    const longest = Math.max(...plans.map((plan) => `data:expensive:${plan.variation_code}`.length));
    console.log(`${service}: ${plans.length} plans, ${unread} unreadable, longest button ${longest}/64`);
    for (const gb of [2, 10, 50]) {
      const state = rebuildState([{ type: 'data_usage_set', gb, at: '2026-11-01T00:00:00.000Z' }]);
      const { recommended, cheaper, bigger } = suggestPlans(state, plans);
      console.log(`  ${gb}GB: ${recommended?.name} | cheaper: ${cheaper?.name} | bigger: ${bigger?.name}`);
    }
  } catch (error) {
    console.log(`${service}: ${error.message}`);
  }
}

if (sandbox) {
  const [plan] = await vtpass.plans('mtn-data');
  const order = await vtpass.buy({ service: 'mtn-data', planCode: plan.variation_code, phone: '08011111111' });
  console.log(`Test order for ${plan.name}: ${order.status}${order.reason ? ` (${order.reason})` : ''}`);
}
