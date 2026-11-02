// The live USDC to naira rate. If no fresh rate is available it fails, so the agent
// never prices a bundle from an old number.

const CACHE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 60 * 60 * 1000;
const DAY_AGE_MS = 26 * 60 * 60 * 1000;

const SOURCES = [
  {
    name: 'CoinGecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=ngn&include_last_updated_at=true',
    maxAgeMs: MAX_AGE_MS,
    read: (body) => ({ rate: body['usd-coin']?.ngn, updatedAt: body['usd-coin']?.last_updated_at * 1000 }),
  },
  {
    // Publishes once a day and prices US dollars, which USDC tracks.
    name: 'ExchangeRate-API',
    url: 'https://open.er-api.com/v6/latest/USD',
    maxAgeMs: DAY_AGE_MS,
    read: (body) => ({ rate: body.rates?.NGN, updatedAt: body.time_last_update_unix * 1000 }),
  },
];

export function createRates({ marginPercent = 0, fetchFn = fetch, now = () => Date.now() } = {}) {
  let cached = null;

  async function fromSource(source) {
    const response = await fetchFn(source.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}`);
    const { rate, updatedAt } = source.read(await response.json());
    if (!(rate > 0)) throw new Error(`${source.name} returned no rate`);
    if (!(now() - updatedAt < source.maxAgeMs)) throw new Error(`${source.name} rate is out of date`);
    return { market: rate, source: source.name };
  }

  return {
    // Naira per USDC. The margin lowers it, so each bundle costs slightly more USDC.
    async current() {
      if (cached && now() - cached.fetchedAt < CACHE_MS) return cached;
      const failures = [];
      for (const source of SOURCES) {
        try {
          const found = await fromSource(source);
          cached = { ...found, rate: found.market * (1 - marginPercent / 100), fetchedAt: now() };
          return cached;
        } catch (error) {
          failures.push(error.message);
        }
      }
      cached = null;
      throw new Error(`No fresh USDC to naira rate: ${failures.join('; ')}`);
    },
  };
}
