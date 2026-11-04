// Mainnet proof: the agent pays the shop for one plan over HTTP 402, in real USDC on Sui.
// Delivery is simulated because VTpass access isn't working yet. Run with NETWORK=mainnet.
import { loadConfig } from '../src/config.js';
import { createRates } from '../src/rate.js';
import { nairaToUsdc, startShop } from '../src/shop.js';
import { createTatum } from '../src/tatum.js';
import { createVtpass, simulatedDelivery } from '../src/vtpass.js';
import { createWallet } from '../src/wallet.js';

const config = { ...loadConfig(), shopPort: 4022 };
if (config.network !== 'mainnet') throw new Error('Run with NETWORK=mainnet');
const MAX_USDC = 0.2; // hard stop for this proof

const vtpass = simulatedDelivery(createVtpass(config.vtpass));
const rates = createRates({ marginPercent: config.rateMarginPercent });
const shop = startShop({ config, vtpass, rates });
const tatum = createTatum({ url: config.tatumUrl, apiKey: config.tatumKey, usdcType: config.usdcType });
const wallet = createWallet(config);

try {
  const plans = await vtpass.plans('mtn-data');
  const plan = [...plans].sort((a, b) => Number(a.variation_amount) - Number(b.variation_amount))[0];
  const before = await tatum.usdcBalance(wallet.address);
  const { rate, source } = await rates.current();
  const price = Number(nairaToUsdc(Number(plan.variation_amount), rate));
  console.log(`Plan: ${plan.name}, about ${price} USDC at N${rate.toFixed(2)} (${source})`);
  if (price > MAX_USDC) throw new Error(`Price ${price} is over the ${MAX_USDC} USDC limit for this proof`);

  const quote = await (await fetch(`http://localhost:${config.shopPort}/quote?service=mtn-data&plan=${plan.variation_code}`)).json();
  const result = await wallet.buyBundle(`http://localhost:${config.shopPort}/buy?quote=${quote.quote}`, price * 1.02);
  console.log(`Shop answered ${result.status}: ${JSON.stringify(result.body.delivery)}`);
  console.log(`Payment: ${result.digest}`);
  console.log(`Explorer: https://suiscan.xyz/mainnet/tx/${result.digest}`);

  await new Promise((resolve) => setTimeout(resolve, 4000));
  console.log(`Agent USDC through Tatum: ${before} -> ${await tatum.usdcBalance(wallet.address)}`);
} finally {
  shop.close();
}
