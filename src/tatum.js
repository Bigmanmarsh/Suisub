// Reads Sui through Tatum's gateway: USDC balance and incoming payments.

// Mainnet nodes prune old history, so an open-ended search fails with "below earliest
// available". The search starts from a recent checkpoint instead. The latest checkpoint
// comes back in the same request, so each check still costs one call.
const START_WINDOW = 300000; // checkpoints to look back on the first check (about a day)
const OVERLAP = 100; // re-read a few checkpoints in case one was still being indexed

const LATEST_CHECKPOINT = '{ checkpoint { sequenceNumber } }';

const RECENT_TRANSACTIONS = `
  query Recent($address: SuiAddress!, $after: UInt53!) {
    checkpoint { sequenceNumber }
    transactions(last: 10, filter: { affectedAddress: $address, afterCheckpoint: $after }) {
      nodes {
        digest
        sender { address }
        effects {
          status
          checkpoint { sequenceNumber }
          balanceChanges { nodes { owner { address } amount coinType { repr } } }
        }
      }
    }
  }`;

const BALANCE = `
  query Balance($address: SuiAddress!, $coinType: String!) {
    address(address: $address) { balance(coinType: $coinType) { totalBalance } }
  }`;

export function createTatum({ url, apiKey, usdcType, fetchFn = fetch }) {
  let after = null;
  async function query(text, variables) {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ query: text, variables }),
    });
    if (!response.ok) throw new Error(`Tatum returned HTTP ${response.status}`);
    const body = await response.json();
    if (body.errors?.length) throw new Error(`Tatum: ${body.errors[0].message}`);
    return body.data;
  }

  return {
    async usdcBalance(address) {
      const data = await query(BALANCE, { address, coinType: usdcType });
      return Number(data.address?.balance?.totalBalance ?? 0) / 1e6;
    },

    // USDC that arrived at `address` from someone else, oldest first.
    async incomingPayments(address) {
      if (after === null) {
        const latest = await query(LATEST_CHECKPOINT);
        after = Math.max(0, Number(latest.checkpoint.sequenceNumber) - START_WINDOW);
      }
      const data = await query(RECENT_TRANSACTIONS, { address, after });
      after = Math.max(after, Number(data.checkpoint.sequenceNumber) - OVERLAP);
      const payments = [];
      for (const node of data.transactions.nodes) {
        if (node.effects.status !== 'SUCCESS' || node.sender?.address === address) continue;
        const received = node.effects.balanceChanges.nodes
          .filter((change) => change.owner?.address === address && change.coinType.repr === usdcType)
          .reduce((sum, change) => sum + BigInt(change.amount), 0n);
        if (received > 0n) {
          payments.push({
            digest: node.digest,
            from: node.sender?.address ?? null,
            amount: Number(received) / 1e6,
            checkpoint: node.effects.checkpoint.sequenceNumber,
          });
        }
      }
      return payments;
    },
  };
}
