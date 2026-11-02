// Creates the agent's small Mainnet spending wallet and saves its key to .env.
// Prints the address only. Keep only a few dollars in this wallet.
import { appendFileSync, readFileSync } from 'node:fs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const env = readFileSync('.env', 'utf8');
const existing = env.match(/^MAINNET_AGENT_KEY=(.+)$/m)?.[1]?.trim();
const wallet = existing ? Ed25519Keypair.fromSecretKey(existing) : Ed25519Keypair.generate();
if (!existing) appendFileSync('.env', `\nMAINNET_AGENT_KEY=${wallet.getSecretKey()}\n`);
console.log(`${existing ? 'Existing' : 'New'} Mainnet agent address: ${wallet.toSuiAddress()}`);
