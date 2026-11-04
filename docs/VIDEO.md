# Demo video plan (target 2:30, limit 2 to 3 minutes)

The phone clip is the only part Marshall records. Everything else is recorded by script and narrated with the Windows voice "Mark", like the Zecathon video.

## Scenes

| # | Time | On screen | Narration |
|---|---|---|---|
| 1 | 0:00 | Title card | I'm Marshall from Lagos. I get paid in crypto, and two things keep happening. I forget to save before I spend, and every time my data runs out, I hunt for a deal from scratch. So I built Suisub: a money agent that remembers, and earns my trust. |
| 2 | 0:20 | Phone: USDC lands, alert appears, tap Yes | When USDC lands in the agent's wallet on Sui, Tatum's gateway spots it, and the agent messages me: my usual is to save half. I tap yes, and it moves the money on Sui Mainnet. |
| 3 | 0:45 | Phone: /data, three options, Buy | For data, it suggests a plan from my monthly usage, with a cheaper and a bigger option, priced at the live naira rate. When I buy, the agent pays a small shop by itself over HTTP 402, using the Machine Payments Protocol on Sui. |
| 4 | 1:10 | Phone: SIMULATED message, then Suiscan transaction | The USDC payment is real, on Mainnet. Our bundle supplier's API wasn't ready in time, so delivery is simulated, and the bot says so every time. |
| 5 | 1:25 | Phone: /usage, I ran out early, new estimate | Every answer becomes a memory on Walrus. When I said I ran out early, it raised my estimate, and its next suggestion changed. After three approvals in a row, it offers to act alone, and one command takes that back. |
| 6 | 1:50 | "What it learned" page, scrolling | This public page shows every lesson and how it changed the agent. When I moved it to a server with no saved files, it rebuilt everything it knew from Walrus Mainnet. |
| 7 | 2:15 | GitHub README | It's open source, it's honest about its limits, and it's built on Tatum, Walrus and Sui. Suisub: money that remembers. |

Scene 4's supplier wording must be updated if VTpass starts working.

## Marshall's phone recording (about 2 minutes, one take is fine)

1. On your phone, turn on Do Not Disturb, so no notifications show up in the recording.
2. Open Telegram, then open @Suisubbot.
3. Start the phone's screen recorder.
4. From your own Sui wallet, send **3 USDC** to the agent's address. The saving and the purchase both pay back into your own wallet, so only network fees are spent.
5. When the alert arrives (within about a minute), wait 2 seconds, then tap **Yes**.
6. Send `/data`. Wait for the three options, then tap **Buy suggested**.
7. Wait for the SIMULATED message.
8. Send `/usage`, then tap **I ran out early**.
9. Send `/status`.
10. Stop recording. Send the video to your laptop, for example through Telegram's Saved Messages, and save it as `C:\hack2\video\phone.mp4`.

Move slowly: pause about 2 seconds after each reply, so the narration can fit.
