// Starts everything: memory, shop, page, Telegram bot and the money watcher.
import { MemWal } from '@mysten-incubation/memwal';
import { createAgent } from './agent.js';
import { createBot, ownerStore, toKeyboard } from './bot.js';
import { loadConfig } from './config.js';
import { createMemory } from './memory.js';
import { startPage } from './page.js';
import { phoneStore } from './phone.js';
import { createRates } from './rate.js';
import { startShop } from './shop.js';
import { createTatum } from './tatum.js';
import { createVtpass, simulatedDelivery } from './vtpass.js';
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
const realVtpass = createVtpass(config.vtpass);
const vtpass = config.simulateDelivery ? simulatedDelivery(realVtpass) : realVtpass;
const wallet = createWallet(config);
const rates = createRates({ marginPercent: config.rateMarginPercent });
const phone = phoneStore(`${config.dataDir}/phone.json`, config.ownerPhone);
const owner = ownerStore(`${config.dataDir}/owner.json`, config.ownerChatId);

const bot = createBot({ token: config.telegramToken, owner, getAgent: () => agent });
const agent = createAgent({
  memory,
  wallet,
  tatum,
  vtpassPlans: (service) => vtpass.plans(service),
  rates,
  phone,
  shopUrl: `http://localhost:${config.shopPort}`,
  config,
  async notify(text, buttons) {
    if (owner.get() === null) return;
    await bot.api.sendMessage(owner.get(), text, buttons ? { reply_markup: toKeyboard(buttons) } : {});
  },
});

startShop({ config, vtpass, rates, ownerPhone: phone.get });
startPage({ memory, port: config.pagePort, host: config.pageHost, isPublic: config.pagePublic });

await agent.announceAddresses().catch((error) => console.error('Telegram:', error.message));
await agent.skipOldPayments().catch((error) => console.error('Tatum:', error.message));
const safely = (job, label) => job().catch((error) => console.error(`${label}:`, error.message));

// Pay checks fail quietly once or twice on a bad connection. After several in a row,
// the owner is told once, so a missed alert is never silent.
const WARN_AFTER_FAILURES = 5;
let failures = 0;
setInterval(async () => {
  try {
    await agent.checkPayments();
    if (failures >= WARN_AFTER_FAILURES) await agent.notifyText('I can check for incoming pay again.');
    failures = 0;
  } catch (error) {
    failures += 1;
    console.error('Payment check:', error.message);
    if (failures === WARN_AFTER_FAILURES) {
      await agent.notifyText(`I can't check for incoming pay right now (${error.message}). I'll keep trying.`).catch(() => {});
    }
  }
}, config.pollSeconds * 1000);
setInterval(() => safely(() => agent.dailyCheck(), 'Daily check'), 3600 * 1000);

console.log(`Network: ${config.network}`);
console.log(`Send pay to: ${wallet.address}`);
console.log(`What it learned: http://localhost:${config.pagePort}`);
// The menu is a nice-to-have, so a network blip here must not stop the agent.
// Only the message is logged: the full error includes a URL with the bot token.
bot.api.setMyCommands([
  { command: 'start', description: 'Start, or see what I remember' },
  { command: 'status', description: 'What I know and what I do by myself' },
  { command: 'bill', description: 'Add a monthly bill: /bill Rent 50 28' },
  { command: 'data', description: 'Find the best data deal for you' },
  { command: 'usage', description: 'Tell me how much data you use' },
  { command: 'phone', description: 'Set the number that gets your data' },
  { command: 'network', description: 'Change your network' },
  { command: 'stop', description: 'Turn off autopilot' },
]).catch((error) => console.error('Telegram menu not updated:', error.message));
bot.start({ onStart:(info) => console.log(`Telegram bot running: @${info.username}`) });
