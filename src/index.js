// Starts everything: memory, shop, page, Telegram bot and the money watcher.
import { MemWal } from '@mysten-incubation/memwal';
import { createAgent } from './agent.js';
import { createBot, ownerStore, toKeyboard } from './bot.js';
import { loadConfig } from './config.js';
import { createMemory } from './memory.js';
import { startPage } from './page.js';
import { startShop } from './shop.js';
import { createTatum } from './tatum.js';
import { createVtpass } from './vtpass.js';
import { createWallet } from './wallet.js';

const config = loadConfig();
const memory = createMemory({
  client: MemWal.create({
    key: config.memwalKey,
    accountId: config.memwalAccountId,
    serverUrl: 'https://relayer.memory.walrus.xyz',
    namespace: config.memwalNamespace,
  }),
  cacheFile: `${config.dataDir}/memories.json`,
});

const restored = await memory.restore();
if (restored > 0) console.log(`Restored ${restored} memories from Walrus.`);
memory.sync();

const tatum = createTatum({ url: config.tatumUrl, apiKey: config.tatumKey, usdcType: config.usdcType });
const vtpass = createVtpass(config.vtpass);
const wallet = createWallet(config);
const owner = ownerStore(`${config.dataDir}/owner.json`);

const bot = createBot({ token: config.telegramToken, owner, getAgent: () => agent });
const agent = createAgent({
  memory,
  wallet,
  tatum,
  vtpassPlans: (service) => vtpass.plans(service),
  shopUrl: `http://localhost:${config.shopPort}`,
  config,
  async notify(text, buttons) {
    if (owner.get() === null) return;
    await bot.api.sendMessage(owner.get(), text, buttons ? { reply_markup: toKeyboard(buttons) } : {});
  },
});

startShop({ config, vtpass });
startPage({ memory, port: config.pagePort });

await agent.skipOldPayments().catch((error) => console.error('Tatum:', error.message));
const safely = (job, label) => job().catch((error) => console.error(`${label}:`, error.message));
setInterval(() => safely(() => agent.checkPayments(), 'Payment check'), config.pollSeconds * 1000);
setInterval(() => safely(() => agent.dailyCheck(), 'Daily check'), 3600 * 1000);

console.log(`Network: ${config.network}`);
console.log(`Send pay to: ${wallet.address}`);
console.log(`What it learned: http://localhost:${config.pagePort}`);
bot.start({ onStart: (info) => console.log(`Telegram bot running: @${info.username}`) });
