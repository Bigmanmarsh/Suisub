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
