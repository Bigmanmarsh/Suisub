// The "agent": asks the shop for something and pays automatically, up to a hard limit.
// The payment package pays whatever the server asks, so the limit lives here.
import 'dotenv/config';
import { Mppx } from 'mppx/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { USDC_TESTNET, sui } from '@suimpp/mpp/client';

const MAX_PRICE = 0.02;
const path = `/${process.argv[2] ?? 'bundle'}`;

const client = new SuiGrpcClient({
  baseUrl: 'https://fullnode.testnet.sui.io:443',
  network: 'testnet',
});
const signer = Ed25519Keypair.fromSecretKey(process.env.PAYER_KEY);
const method = sui({ client, signer, currency: USDC_TESTNET });

const guarded = {
  ...method,
  async createCredential(context) {
    const { amount, recipient } = context.challenge.request;
    if (recipient !== process.env.SHOP_ADDRESS) throw new Error(`Refused: unknown recipient ${recipient}`);
    if (Number(amount) > MAX_PRICE) throw new Error(`Refused: price ${amount} is over the ${MAX_PRICE} limit`);
    console.log(`Paying ${amount} USDC...`);
    return method.createCredential(context);
  },
};

const mppx = Mppx.create({ methods: [guarded], polyfill: false });
const response = await mppx.fetch(`http://localhost:4020${path}`).catch((error) => {
  console.log('Stopped:', error.message);
  process.exit(1);
});
console.log('Status:', response.status);
console.log('Body:', await response.text());
const receipt = response.headers.get('payment-receipt');
if (receipt) console.log('Receipt:', Buffer.from(receipt, 'base64url').toString());
