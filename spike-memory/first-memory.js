// Saves one memory on Walrus Mainnet through the managed relayer, then searches for it.
import { config } from 'dotenv';
import { MemWal } from '@mysten-incubation/memwal';

config({ path: '../.env' });

const memwal = MemWal.create({
  key: process.env.MEMWAL_KEY,
  accountId: process.env.MEMWAL_ACCOUNT_ID,
  serverUrl: 'https://relayer.memory.walrus.xyz',
  namespace: 'spike-memory',
});

console.log('Health:', await memwal.health());
const job = await memwal.remember('Test user usually saves 20% of each payment and renews MTN data on Fridays.');
console.log('Job:', job.job_id);
const done = await memwal.waitForRememberJob(job.job_id);
console.log('Saved:', JSON.stringify(done).slice(0, 400));
const result = await memwal.recall({ query: 'How much does this user save?' });
console.log('Recall:', JSON.stringify(result.results).slice(0, 500));
