# I built a money agent that earns my trust

I'm Marshall, a beginner builder in Lagos. I get paid in crypto, and I have two money habits I keep failing at.

When pay lands, I mean to move some to savings, then I forget and spend it. When my data runs out, I hunt for a deal all over again, as if I'd never bought data before.

So for the Total Recall hackathon, I built Suisub: a Telegram agent that remembers these things for me.

## What it does

Suisub lives in a Telegram chat, so there's no new app to learn.

- **It spots my pay.** When USDC lands on Sui, it messages me: "Your usual: save 20%. OK?"
- **It remembers my bills** and reminds me before they're due.
- **It suggests data plans from my monthly usage** on MTN, Airtel, Glo or 9mobile, with a cheaper and a bigger option.
- **It can pay by itself,** but only once I've given it permission, and only within a limit.

## How it uses Tatum and Walrus

**Walrus Memory is the agent's brain.** Every lesson is stored as a memory on Walrus Mainnet: my savings rate, my bills, my network, how much data I use, and what I've allowed it to do. The agent's behaviour is rebuilt from those memories. In testing, I deleted its local copy, and it recovered what it knew from Walrus.

**Tatum is how it sees my money.** It reads Sui through Tatum's gateway to spot incoming USDC and check balances.

**Agent payments are how it acts.** When it buys data, it asks a small shop for the bundle. The shop answers "402: pay first," and the agent pays in USDC on Sui using the Machine Payments Protocol, then tries again. The payment package pays whatever a server asks, so I added the agent's own check on the price and recipient.

## How it learned over time

This is the part I care about most, because the agent behaves differently as it learns:

| When this happens | It changes like this |
|---|---|
| I approve saving three times in a row | It offers to save by itself |
| I change my savings rate | It uses the new rate and goes back to asking first |
| I tap "Too expensive" | It won't suggest that price or above again |
| I tap "I ran out early" | It raises my usage estimate and suggests a bigger plan |
| I keep buying plans of one length | It prefers that length |
| My purchases span at least a week | They replace the usage number I first gave it |

A "What it learned" page lists every memory and shows how each one changed the agent.

<!-- BEFORE PUBLISHING: add what really happened in Marshall's own use, with the final memory count and a screenshot of the page. -->

## What it can't do yet

Honesty matters more to me than a perfect demo:

<!-- BEFORE PUBLISHING: update the first two points to match what finally worked. -->
- **Bundle delivery:** I couldn't get VTpass's API working in time, so the demo's bundle delivery is simulated, and the bot says so each time. The payment itself is real.
- **Network:** memories are on Walrus Mainnet, and payments were tested on Sui testnet.
- **Refunds:** if an order failed after payment, the USDC wouldn't come back automatically.
- **Pricing:** prices use a public market rate plus 1%, so they can differ from what your exchange gives you.
- **Data usage:** it can't see my phone's real usage. It estimates from what I tell it and what I buy.
- **Who it's for:** it runs on my own computer, for one person.

## What's next

Reliable bundle delivery, refunds for failed orders, WhatsApp support, and moving it off my laptop so it can stay on all the time.

The code is open source: <!-- ADD GITHUB LINK -->

Built with Tatum, Walrus Memory and Sui. @Tatum_io @WalrusFoundation
