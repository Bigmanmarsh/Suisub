// Runs the agent against real services on testnet: Sui payments, Walrus Memory and Tatum.
// VTpass is faked here, so no bundle is bought. Telegram is replaced by printing messages.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemWal } from '@mysten-incubation/memwal';
import { createAgent } from '../src/agent.js';
import { rebuildState } from '../src/brain.js';
import { loadConfig } from '../src/config.js';
import { createMemory } from '../src/memory.js';
import { startShop } from '../src/shop.js';
import { createTatum } from '../src/tatum.js';
import { createWallet } from '../src/wallet.js';

const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
const config = { ...loadConfig(), dataDir: dir, shopPort: 4021 };
if (config.network !== 'testnet') throw new Error('This script only runs on testnet');

const client = MemWal.create({
  key: config.memwalKey,
  accountId: config.memwalAccountId,
  serverUrl: 'https://relayer.memory.walrus.xyz',
  namespace: `e2e-${Date.now()}`,
});
const cacheFile = join(dir, 'memories.json');
const memory = createMemory({ client, cacheFile });
const tatum = createTatum({ url: config.tatumUrl, apiKey: config.tatumKey, usdcType: config.usdcType });
const wallet = createWallet(config);

const fakeVtpass = {
  plans: async () => [{ variation_code: 'mtn-10mb-100', name: 'N100 100MB - 24 hrs', variation_amount: '100.00' }],
  buy: async () => ({ status: 'delivered', requestId: 'fake-vtpass' }),
};
const shop = startShop({ config, vtpass: fakeVtpass });

let lastButtons = [];
const agent = createAgent({
  memory,
  wallet,
  tatum,
  vtpassPlans: fakeVtpass.plans,
  shopUrl: `http://localhost:${config.shopPort}`,
  config,
  async notify(text, buttons) {
    console.log(`BOT: ${text}`);
    lastButtons = buttons?.flat().map((item) => item.data) ?? [];
  },
});

try {
  const before = await tatum.usdcBalance(wallet.address);
  await agent.start();
  await agent.press('setup:20');
  await agent.press('network:mtn-data');

  await agent.handlePay({ digest: `e2e-pay-${Date.now()}-000000`, amount: 0.05 });
  await agent.press(lastButtons[0]);

  await agent.press('budget:500');
  await agent.press(lastButtons[0]);

  const after = await tatum.usdcBalance(wallet.address);
  console.log(`Tatum balance: ${before} -> ${after} USDC`);

  console.log('Waiting for memories to reach Walrus...');
  await memory.idle();
  const saved = memory.records();
  console.log(`Stored ${saved.filter((record) => record.blobId).length} of ${saved.length} memories`);

  rmSync(cacheFile);
  const fresh = createMemory({ client, cacheFile });
  console.log(`After deleting the local cache, restored ${await fresh.restore()} memories`);
  const same = JSON.stringify(rebuildState(fresh.events())) === JSON.stringify(rebuildState(memory.events()));
  console.log(`Rebuilt knowledge matches: ${same}`);
} finally {
  shop.close();
  rmSync(dir, { recursive: true, force: true });
}
