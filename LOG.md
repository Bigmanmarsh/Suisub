# Build log: Total Recall (Tatum x Walrus Memory Hackathon)

Deadline: Mon 10 Nov 2026, 17:00 UTC (18:00 Lagos). Our target: Wed 4 Nov.

## 2026-10-30
- Idea locked: a Telegram money agent for people paid in crypto. It pings you when
  pay lands, remembers your bills and savings habits, and earns permission to
  handle them for you.
- Track: Consumer Finance. Also aiming for Best Walrus Memory and Best Use of Agent Payments.
- Must prove first: a 1-cent USDC agent payment on Sui, and one real data bundle purchase.
- Decision rule: if the payment test has not passed by Sat 31 Oct, drop payments.
- Payment test set up in spike-payment/ on Sui testnet using @suimpp/mpp 0.9.0 and mppx 0.4.
  The package pays whatever a server asks, so pay.js enforces its own price and recipient limit.

## 2026-11-02
- Payment test PASSED on Sui testnet: the agent paid 0.01 USDC, the shop verified it and delivered.
  Transaction: 8hgyCgD3Rx4As1b72rR5Yk9zY4YvufZX77XonY8WWcsm
- Still to prove: the same payment on Mainnet, Walrus Memory writes, Tatum Sui reads, real bundle purchase.
- Note: public Sui fullnodes have dropped JSON-RPC, so check which interface Tatum's Sui RPC offers.
- Tatum Sui Mainnet read works through the GraphQL endpoint (/graphql). A plain JSON-RPC POST to the gateway returned 404; gRPC not tested yet.
- First Walrus Memory saved on Mainnet and recalled through the managed relayer (1 of 10). Blob: oAZ4XgWeV79VAYCAv_hhUsif-eLQjNfvnrBEHgXlTZQ
- Node is 24.20.0; the Walrus docs ask for 24.22.1+. It ran fine, but upgrade before the final build.
- Bundle research reviewed. Proposed route: agent pays our shop in USDC on Sui (MPP), and the shop buys the bundle from VTpass using a small naira balance Marshall funds. No Sui-accepting bundle seller was found.
- Limits to design around: Tatum free plan is listed as 100K lifetime credits at 3 requests/sec; the managed relayer sees plaintext and has unpublished usage limits; bundles only for Marshall's own line until reselling rules are clear.
- Agent built: learning logic, Tatum pay detection, Walrus memories, savings transfers, 402 bundle shop, Telegram bot, "what it learned" page. 29 tests pass.
- Real testnet run passed twice: USDC saved and paid to the shop, memories stored on Walrus Mainnet, knowledge rebuilt after deleting the local cache. VTpass was faked in this run.
- Bugs the real run found: a first memory write can return 404 (now retried), and network blips while building a transaction (build now retried; sending is never retried).
- VTpass plan lists work for all four networks, but the keys are refused (401) on sandbox order and balance calls. Plan lists don't appear to need valid keys.
- Real plan lists exposed a bad default: "best value" chose a N50,000 plan. The agent now asks for a budget first and skips app-only or night-only plans.
- Replaced the placeholder rate (1500) with a live USDC to naira rate: CoinGecko first, ExchangeRate-API as a backup, no purchase if neither is fresh. Shop quotes lock the price, and each quote buys once.
- Plan offers now come from monthly usage: a suggested plan plus a cheaper and a bigger choice. Usage comes from what the user says, their purchases, and "ran out early" or "had data left". The app cannot see the phone's real usage.
- VTpass keys still return 087 INVALID CREDENTIALS on sandbox. Added VTPASS_MODE=simulated: real payment, no bundle, and the bot says so.
- Real pay test: a separate testnet wallet paid the agent 1 USDC, and Tatum saw it.
- Wrote README, LICENSE, blog draft and submission answers.
