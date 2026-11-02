// The agent's small spending wallet: moves USDC to savings and pays the shop.
// The payment package pays whatever a server asks, so the limits are enforced here.
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { USDC, USDC_TESTNET, sui } from '@suimpp/mpp/client';
import { Mppx } from 'mppx/client';

export function guardPayment(method, { shopAddress, getLimit }) {
  return {
    ...method,
    async createCredential(context) {
      const { amount, recipient } = context.challenge.request;
      if (recipient !== shopAddress) throw new Error('Refused: payment address is not our shop');
      if (Number(amount) > getLimit()) throw new Error(`Refused: ${amount} USDC is over the limit`);
      return method.createCredential(context);
    },
  };
}

export function createWallet(config) {
  const client = new SuiGrpcClient({ baseUrl: config.fullnodeUrl, network: config.network });
  const signer = Ed25519Keypair.fromSecretKey(config.agentKey);
  const currency = config.network === 'mainnet' ? USDC : USDC_TESTNET;
  let limit = 0;
  const mppx = Mppx.create({
    polyfill: false,
    methods: [
      guardPayment(sui({ client, signer, currency }), {
        shopAddress: config.shopAddress,
        getLimit: () => limit,
      }),
    ],
  });

  return {
    address: signer.toSuiAddress(),

    async sendUsdc(recipient, amount) {
      const tx = new Transaction();
      tx.setSender(signer.toSuiAddress());
      const balance = BigInt(Math.floor(amount * 1e6));
      tx.transferObjects([coinWithBalance({ type: config.usdcType, balance })], recipient);
      // Building is safe to retry after a network blip. Sending is not: it could pay twice.
      const transaction = await tx.build({ client }).catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return tx.build({ client });
      });
      const result = await client.core.signAndExecuteTransaction({
        transaction,
        signer,
        include: { effects: true },
      });
      if (result.FailedTransaction || !result.Transaction) {
        throw new Error(result.FailedTransaction?.status?.error?.message ?? 'Transaction failed');
      }
      return result.Transaction.digest;
    },

    // Asks the shop for a bundle, paying automatically on a 402 up to maxUsdc.
    async buyBundle(url, maxUsdc) {
      limit = maxUsdc;
      try {
        const response = await mppx.fetch(url);
        const receipt = response.headers.get('payment-receipt');
        const digest = receipt ? JSON.parse(Buffer.from(receipt, 'base64url').toString()).reference : null;
        return { status: response.status, body: await response.json(), digest };
      } finally {
        limit = 0;
      }
    },
  };
}
