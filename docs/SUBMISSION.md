# Submission form answers

Deadline: Mon 10 Nov 2026, 17:00 UTC (18:00 Lagos). Field names come from Arena's copy of the rules, so check them against the real form.

## Marshall fills these in

- Email
- Discord handle
- LinkedIn
- How did you hear about this event?
- Is this your first Web3 project? (You entered Payslip on Zcash before, so answer truthfully.)
- Tatum ID (your Tatum dashboard account ID)
- SUI address (your own wallet)
- Account ID (SUI) (ask in Discord if unclear; it may be your Walrus Memory account ID)
- MEMWAL_AGENT_ID (the public key under "Delegate keys" in the Walrus Memory dashboard)
- Short demo video link (2 to 3 minutes)
- GitHub repo link
- How was your experience building with Walrus? (draft below, change it to your own words)
- How was your experience building with the Tatum AI Builder? (draft below)

## Project description

Suisub is a Telegram money agent for people paid in crypto. It spots incoming USDC on Sui through Tatum, remembers your bills, savings habits and data usage on Walrus Memory Mainnet, and suggests data plans for MTN, Airtel, Glo and 9mobile with cheaper and bigger options. It starts by asking, learns from every answer and correction, and earns permission to act alone within limits you set. The agent pays for purchases itself over HTTP 402 using MPP on Sui. A "What it learned" page shows every memory and how it changed the agent.

Status: UPDATE BEFORE SUBMITTING (Mainnet payments and real bundle delivery).

## Experience building with Walrus

Writing and recalling memories was simple once set up. The best moment was deleting the local copy and seeing the agent rebuild what it knew from Walrus. One rough edge: a first write sometimes returned a 404, so I added safe retries using idempotency keys.

## Experience building with the Tatum AI Builder

I looked at the AI Builder's page but built the app in Claude Code, because I needed Walrus Memory and Sui, which the page didn't list. I used Tatum's Sui gateway for onchain reads. EDIT: only keep "looked at" if you actually did.
