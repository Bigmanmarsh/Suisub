# Suisub

A Telegram money agent for people paid in crypto. It spots your pay on Sui, remembers your bills and savings habits on Walrus Memory, suggests data plans from your monthly usage, and earns permission to handle these for you.

Built for the Total Recall hackathon (Tatum x Walrus Memory), Consumer Finance track.

## The problem

When pay lands, it's easy to forget to save some and end up spending it. When data runs out, you hunt for a deal all over again. Most money apps ask the same questions every time.

## How it learns

1. **It asks.** Pay lands, and the agent says: "Your usual: save 20%. OK?"
2. **It remembers.** Each answer becomes a memory on Walrus Mainnet.
3. **It changes.** Corrections change the next suggestion. "Too expensive" sets a price limit. "I ran out early" raises its data estimate.
4. **It earns trust.** After three approvals in a row, it offers to act alone, within a limit. `/stop` takes that back, and a correction resets it.

Delete the local files and the agent rebuilds what it knows from Walrus.

## How it uses each technology

| Technology | Job |
|---|---|
| **Walrus Memory** (Mainnet) | Stores every lesson. The agent's behaviour is rebuilt from these memories. |
| **Tatum Sui gateway** (GraphQL) | Spots incoming USDC and reads balances. |
| **MPP on Sui** (`@suimpp/mpp`) | The agent pays a bundle shop per purchase. The shop answers `402 Payment Required`, and the agent pays in USDC and retries. |
| **VTpass** | Live plan lists for MTN, Airtel, Glo and 9mobile, and bundle orders. |
| **CoinGecko**, with ExchangeRate-API as backup | Live USDC to naira rate. |

## Safety

- The payment package pays whatever a server asks, so the agent checks the price and recipient itself before paying.
- It acts alone only with permission, and only within limits you set.
- A used payment can't buy twice, and each locked price quote buys once.
- If no fresh rate is available, it won't sell a bundle.

## Honest limits

- **Bundle delivery depends on VTpass access.** With `VTPASS_MODE=simulated`, the payment is real but no bundle is delivered, and the bot says so every time.
- **Network status.** See "Current status" below for what has run on testnet and Mainnet.
- **If a bundle order fails after payment, the USDC isn't refunded automatically.** The bot says clearly that nothing was delivered.
- **The shop pays VTpass from a naira balance funded by hand.** USDC isn't converted to naira automatically.
- **Prices come from a public market rate plus a 1% margin.** Your own exchange's rate may differ.
- **It can't see your phone's data usage.** The estimate comes from what you tell it, what you buy, and whether you ran out.
- **"Best" means best among the VTpass plans it can read,** not across the whole market. Plans with unusual names are skipped.
- **The managed Walrus relayer can read memories while processing them,** so the agent doesn't store phone numbers or real names there.
- **It serves one person.** Only the owner can use the bot, and purchases go only to the owner's line. It's not a service for other people.
- **Payout addresses are only as good as the settings.** In testing, a wrong address in the hosting settings sent 2.34 USDC to an address nobody controls. The bot now announces where savings and shop payments go every time it starts, and shows them in `/status`.

## Current status

- **Walrus Memory:** writing on Mainnet. On a fresh server, the agent rebuilt everything it knew from Walrus.
- **Tatum Sui gateway:** detects real incoming USDC on Mainnet.
- **Savings and MPP agent payments:** real USDC on Sui Mainnet. For example, the agent paid the shop for a plan in [this transaction](https://suiscan.xyz/mainnet/tx/AzrBLkZ2CpShZKtjTB1mYKGQScByzzpeDKMbjp6XXyfr).
- **Hosting:** runs online on Render's free plan, with a public "What it learned" page at [suisub.onrender.com](https://suisub.onrender.com).
- **VTpass:** plan lists work. Bundle orders aren't working yet, so delivery is simulated and labelled as such.

## Run it

Requires Node.js 22 or newer.

```bash
npm install --ignore-scripts
```

Create a `.env` file with these settings:

```text
NETWORK=testnet
TATUM_API_KEY=
MEMWAL_KEY=
MEMWAL_ACCOUNT_ID=
TELEGRAM_BOT_TOKEN=
AGENT_KEY=
SHOP_ADDRESS=
SAVINGS_ADDRESS=
PAYMENT_SECRET_KEY=
OWNER_PHONE=
VTPASS_MODE=simulated
VTPASS_API_KEY=
VTPASS_PUBLIC_KEY=
VTPASS_SECRET_KEY=
```

Then start it and test it:

```bash
npm start
```

```bash
npm test
```

The first person to send `/start` becomes the bot's only owner. The "what it learned" page runs at `http://localhost:4030`.

## Commands

`/start`, `/status`, `/bill Rent 50 28`, `/data`, `/usage`, `/network`, `/stop`

## License

MIT
