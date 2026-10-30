// Creates two throwaway TESTNET wallets and saves them to .env (never committed).
// Prints addresses only. Do not use these wallets for real money.
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

if (existsSync('.env')) {
  console.log('.env already exists, keeping it.');
  process.exit(0);
}
const payer = Ed25519Keypair.generate();
const shop = Ed25519Keypair.generate();
writeFileSync('.env', [
  `PAYER_KEY=${payer.getSecretKey()}`,
  `SHOP_ADDRESS=${shop.toSuiAddress()}`,
  `PAYMENT_SECRET_KEY=${randomBytes(32).toString('hex')}`,
  '',
].join('\n'));
console.log('Payer (agent) address:', payer.toSuiAddress());
console.log('Shop address:         ', shop.toSuiAddress());
