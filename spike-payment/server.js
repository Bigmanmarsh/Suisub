// A tiny "shop" that answers 402 Payment Required until it is paid 1 cent of testnet USDC.
import 'dotenv/config';
import { createServer } from 'node:http';
import { Mppx } from 'mppx/server';
import { InMemoryDigestStore, USDC_TESTNET, sui } from '@suimpp/mpp/server';

const mppx = Mppx.create({
  realm: 'localhost',
  secretKey: process.env.PAYMENT_SECRET_KEY,
  methods: [
    sui({
      currency: USDC_TESTNET,
      recipient: process.env.SHOP_ADDRESS,
      network: 'testnet',
      store: new InMemoryDigestStore(),
    }),
  ],
});

const prices = { '/bundle': '0.01', '/overpriced': '5' };

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost:4020');
  if (pathname === '/health') return res.end('ok');
  if (!prices[pathname]) {
    res.statusCode = 404;
    return res.end();
  }
  const result = await mppx.charge({ amount: prices[pathname] })(
    new Request(`http://localhost:4020${req.url}`, { headers: req.headers }),
  );
  const response =
    result.status === 402
      ? result.challenge
      : result.withReceipt(Response.json({ delivered: 'test data bundle' }));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
}).listen(4020, () => console.log('Shop running on http://localhost:4020'));
