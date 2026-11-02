// Testnet only: sends the agent a real USDC payment from a separate wallet,
// so the running app should spot it through Tatum and send a pay alert.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { loadConfig } from '../src/config.js';
import { createWallet } from '../src/wallet.js';

const config = loadConfig();
if (config.network !== 'testnet') throw new Error('This script only runs on testnet');
const amount = Number(process.argv[2] ?? 1);

const file = `${config.dataDir}/test-sender.json`;
mkdirSync(config.dataDir, { recursive: true });
if (!existsSync(file)) writeFileSync(file, JSON.stringify({ key: Ed25519Keypair.generate().getSecretKey() }));
const senderKey = JSON.parse(readFileSync(file, 'utf8')).key;

const agent = createWallet(config);
const sender = createWallet({ ...config, agentKey: senderKey });

// The sender needs a little USDC and SUI, which come from the agent's test funds.
await agent.sendUsdc(sender.address, amount);
const client = new SuiGrpcClient({ baseUrl: config.fullnodeUrl, network: config.network });
const signer = Ed25519Keypair.fromSecretKey(config.agentKey);
const tx = new Transaction();
tx.setSender(signer.toSuiAddress());
const [gas] = tx.splitCoins(tx.gas, [50_000_000]);
tx.transferObjects([gas], sender.address);
await client.core.signAndExecuteTransaction({ transaction: await tx.build({ client }), signer });
await new Promise((resolve) => setTimeout(resolve, 5000));

const digest = await sender.sendUsdc(agent.address, amount);
console.log(`Sent ${amount} USDC to the agent: ${digest}`);
