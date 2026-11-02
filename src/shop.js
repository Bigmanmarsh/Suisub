// The bundle shop: takes USDC on Sui over HTTP 402, then buys the bundle from VTpass
// with a naira balance the owner funded by hand. It only ever delivers to the owner's line.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { USDC, USDC_TESTNET, sui } from '@suimpp/mpp/server';
import { Mppx } from 'mppx/server';

const QUOTE_MS = 10 * 60 * 1000;
const SERVICES = new Set(['mtn-data', 'airtel-data', 'glo-data', 'etisalat-data']);

// Remembers used payments across restarts, so one payment can't buy twice.
export function fileDigestStore(file) {
  const digests = new Set(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
  return {
    has: async (digest) => digests.has(digest),
    async set(digest) {
      digests.add(digest);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify([...digests]));
    },
  };
}

export function nairaToUsdc(naira, ngnPerUsdc) {
  return (Math.ceil((naira / ngnPerUsdc) * 1e6) / 1e6).toFixed(6);
}

// A quote locks one price, so a rate change can't alter it between asking for payment and
// checking it. Each quote buys one bundle.
export function createShopHandler({ mppx, vtpass, ownerPhone, rates, now = () => Date.now() }) {
  const quotes = new Map();

  async function createQuote(searchParams) {
    const service = searchParams.get('service');
    if (!SERVICES.has(service)) return Response.json({ error: 'Unknown service' }, { status: 404 });
    const plans = await vtpass.plans(service);
    const plan = plans.find((item) => item.variation_code === searchParams.get('plan'));
    if (!plan) return Response.json({ error: 'Unknown plan' }, { status: 404 });

    for (const [id, quote] of quotes) if (quote.expiresAt < now()) quotes.delete(id);
    const { rate, source } = await rates.current();
    const id = randomUUID();
    const amount = nairaToUsdc(Number(plan.variation_amount), rate);
    quotes.set(id, { service, plan, amount, expiresAt: now() + QUOTE_MS });
    return Response.json({ quote: id, amount, rate, source });
  }

  return async function handle(request) {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === '/quote') return createQuote(searchParams);
    if (pathname !== '/buy') return Response.json({ error: 'Not found' }, { status: 404 });

    const id = searchParams.get('quote');
    const quote = quotes.get(id);
    if (!quote || quote.expiresAt < now()) return Response.json({ error: 'Quote expired' }, { status: 410 });

    const result = await mppx.charge({ amount: quote.amount })(request);
    if (result.status === 402) return result.challenge;

    quotes.delete(id);
    const delivery = await vtpass.buy({ service: quote.service, planCode: quote.plan.variation_code, phone: ownerPhone })
      .catch((error) => ({ status: 'failed', reason: error.message }));
    return result.withReceipt(Response.json({ delivery, plan: quote.plan.name, amount: quote.amount }));
  };
}

export function startShop({ config, vtpass, rates }) {
  const mppx = Mppx.create({
    realm: 'bundle-shop',
    secretKey: config.paymentSecret,
    methods: [
      sui({
        currency: config.network === 'mainnet' ? USDC : USDC_TESTNET,
        recipient: config.shopAddress,
        network: config.network,
        store: fileDigestStore(`${config.dataDir}/used-payments.json`),
      }),
    ],
  });
  const handle = createShopHandler({ mppx, vtpass, ownerPhone: config.ownerPhone, rates });

  // Listens on this computer only: the shop is not open to the internet.
  const server = createServer(async (req, res) => {
    try {
      const response = await handle(
        new Request(`http://localhost:${config.shopPort}${req.url}`, { headers: req.headers }),
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (error) {
      console.error('Shop error:', error.message);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Shop error' }));
    }
  });
  server.listen(config.shopPort, '127.0.0.1');
  return server;
}
