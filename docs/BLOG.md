# My money had no memory, so I built an agent that does

I'm Marshall, a beginner builder in Lagos. I get paid in crypto, and two things keep happening to me.

When pay lands, I tell myself I'll save part of it. A few days later, it's gone. And when my data runs out, I'm back on USSD hunting for a bundle, every month, from scratch.

For the Total Recall hackathon, I built **Suisub**: a Telegram money agent that remembers what I do, and slowly earns permission to do it for me.

## What it does

Suisub lives in a Telegram chat, so there's no new app to learn.

- **It spots my pay.** When USDC lands in the agent's wallet on Sui, it messages me: "Your usual: save 50%. OK?"
- **It suggests data plans from my monthly usage** for MTN, Airtel, Glo or 9mobile, with a cheaper and a bigger option, priced at a live naira rate.
- **It pays by itself.** When I tap Buy, the agent pays a small shop in USDC on Sui, with no card and no checkout.
- **It earns trust.** After I approve the same thing three times in a row, it offers to do it alone, within a limit. One command, `/stop`, takes that back.

## How it uses Tatum and Walrus

**Walrus Memory is the agent's brain.** Every lesson is saved as a memory on Walrus Mainnet: my savings rate, my bills, my network, my data use, and what I've allowed it to do. The agent's behaviour is rebuilt from those memories every time it starts.

The moment that convinced me: when I moved the agent from my laptop to a free server with no saved files, it came back and restored all 12 memories from Walrus by itself, and it still knew how I like things done.

**Tatum is how it sees my money.** It reads Sui Mainnet through Tatum's gateway to spot incoming USDC and check balances.

**Agent payments are how it acts.** When it buys data, the shop answers "402: pay first". The agent pays in USDC on Sui using the Machine Payments Protocol, then tries again. The payment library pays whatever a server asks, so I added the agent's own check on the price and the recipient.

## How it learned over time

This is the part I care about most, because the agent visibly changes:

| When this happens | It changes like this |
|---|---|
| I approve saving three times in a row | It offers to save by itself |
| I change my savings rate | It uses the new rate and goes back to asking first |
| I tap "Too expensive" | It won't suggest that price or above again |
| I tap "I ran out early" | It raises my usage estimate and suggests a bigger plan |
| I keep buying plans of one length | It prefers that length |
| My purchases cover at least a week | They replace the usage number I first gave it |

In my own use, I told it I use about 5GB a month. After a purchase and "I ran out early", its estimate is now 7.8GB, and its suggestions moved up with it. A public "What it learned" page lists every memory and how it changed the agent: https://suisub.onrender.com

## What went wrong, honestly

**Testing with real money taught me something.** On the server, I copied the wrong address into the settings, and 2.34 USDC went to an old test address whose key no longer exists. That money is gone. Now the bot announces where savings and payments go every time it starts, and shows it in `/status`, so a wrong address can't stay hidden.

**Mainnet showed me a difference testnet didn't.** Tatum's Mainnet node keeps only recent history, so the agent's first way of looking for payments failed silently. It now searches from a recent point and warns me if checks keep failing.

## What it can't do yet

- **Bundle delivery is simulated.** I couldn't get the data provider's (VTpass) API access working in time. The USDC payment is real, on Mainnet, but no bundle reaches the line, and the bot says so every time.
- **It can't see my phone's data usage.** It estimates from what I tell it and what I buy.
- **Prices use a public market rate plus 1%,** so they can differ from what my exchange gives me.
- **It serves one person.** Only the owner can use it.

## What's next

Real bundle delivery once VTpass access is approved, refunds if an order fails after payment, and WhatsApp support, since that's where my community lives.

The code is open source: https://github.com/Bigmanmarsh/Suisub

<!-- ADD the X post link here once it's live -->

Built with Tatum, Walrus Memory and Sui for Total Recall.
