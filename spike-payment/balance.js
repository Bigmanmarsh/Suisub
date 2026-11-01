// Shows the test wallet's testnet balances.
import 'dotenv/config';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SUI_USDC_TESTNET_TYPE } from '@suimpp/mpp/client';

const client = new SuiGrpcClient({ baseUrl: 'https://fullnode.testnet.sui.io:443', network: 'testnet' });
const owner = Ed25519Keypair.fromSecretKey(process.env.PAYER_KEY).toSuiAddress();
for (const address of [owner, process.env.SHOP_ADDRESS]) {
  const sui = await client.core.getBalance({ owner: address });
  const usdc = await client.core.getBalance({ owner: address, coinType: SUI_USDC_TESTNET_TYPE });
  console.log(address.slice(0, 10), 'SUI:', Number(sui.balance.balance) / 1e9, 'USDC:', Number(usdc.balance.balance) / 1e6);
}
