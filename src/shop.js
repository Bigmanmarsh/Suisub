// The bundle shop: takes USDC on Sui over HTTP 402, then buys the bundle from VTpass
// with a naira balance the owner funded by hand. It only ever delivers to the owner's line.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { USDC, USDC_TESTNET, sui } from '@suimpp/mpp/server';
import { Mppx } from 'mppx/server';

const SERVICES = new Set(['mtn-data', 'airtel-data']);

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

export function createShopHandler({ mppx, vtpass, ownerPhone, ngnPerUsdc }) {
  return async function handle(request) {
    const { pathname, searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    if (!SERVICES.has(service)) return Response.json({ error: 'Unknown service' }, { status: 404 });

    const plans = await vtpass.plans(service);
    if (pathname === '/plans') return Response.json({ plans });
    if (pathname !== '/buy') return Response.json({ error: 'Not found' }, { status: 404 });

    const plan = plans.find((item) => item.variation_code === searchParams.get('plan'));
    if (!plan) return Response.json({ error: 'Unknown plan' }, { status: 404 });

    const amount = nairaToUsdc(Number(plan.variation_amount), ngnPerUsdc);
    const result = await mppx.charge({ amount })(request);
    if (result.status === 402) return result.challenge;

    const delivery = await vtpass.buy({ service, planCode: plan.variation_code, phone: ownerPhone })
      .catch((error) => ({ status: 'failed', reason: error.message }));
    return result.withReceipt(Response.json({ delivery, plan: plan.name, amount }));
  };
}

export function startShop({ config, vtpass }) {
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
  const handle = createShopHandler({ mppx, vtpass, ownerPhone: config.ownerPhone, ngnPerUsdc: config.ngnPerUsdc });

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
