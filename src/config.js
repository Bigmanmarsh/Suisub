import 'dotenv/config';

const USDC = {
  mainnet: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  testnet: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
};

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

export function loadConfig() {
  const network = required('NETWORK');
  if (!USDC[network]) throw new Error('NETWORK must be testnet or mainnet');
  const mainnet = network === 'mainnet';
  return {
    network,
    usdcType: USDC[network],
    tatumKey: required('TATUM_API_KEY'),
    tatumUrl: `https://sui-${network}.gateway.tatum.io/graphql`,
    fullnodeUrl: `https://fullnode.${network}.sui.io:443`,
    memwalKey: required('MEMWAL_KEY'),
    memwalAccountId: required('MEMWAL_ACCOUNT_ID'),
    memwalNamespace: process.env.MEMWAL_NAMESPACE?.trim() || 'money-agent',
    telegramToken: required('TELEGRAM_BOT_TOKEN'),
    agentKey: required(mainnet ? 'MAINNET_AGENT_KEY' : 'AGENT_KEY'),
    shopAddress: required(mainnet ? 'MAINNET_SHOP_ADDRESS' : 'SHOP_ADDRESS'),
    savingsAddress: required(mainnet ? 'MAINNET_SAVINGS_ADDRESS' : 'SAVINGS_ADDRESS'),
    paymentSecret: required('PAYMENT_SECRET_KEY'),
    rateMarginPercent: Number(process.env.RATE_MARGIN_PERCENT ?? 1),
    ownerPhone: required('OWNER_PHONE'),
    simulateDelivery: process.env.VTPASS_MODE === 'simulated',
    vtpass: {
      baseUrl: process.env.VTPASS_MODE === 'live' ? 'https://vtpass.com/api' : 'https://sandbox.vtpass.com/api',
      apiKey: process.env.VTPASS_API_KEY?.trim() ?? '',
      publicKey: process.env.VTPASS_PUBLIC_KEY?.trim() ?? '',
      secretKey: process.env.VTPASS_SECRET_KEY?.trim() ?? '',
    },
    shopPort: Number(process.env.SHOP_PORT ?? 4020),
    pagePort: Number(process.env.PORT ?? process.env.PAGE_PORT ?? 4030),
    pageHost: process.env.PAGE_HOST?.trim() || '127.0.0.1',
    pagePublic: process.env.PAGE_PUBLIC === 'true',
    ownerChatId: process.env.OWNER_CHAT_ID ? Number(process.env.OWNER_CHAT_ID) : null,
    pollSeconds: Number(process.env.POLL_SECONDS ?? 30),
    dataDir: process.env.DATA_DIR?.trim() || 'data',
  };
}
