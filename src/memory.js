// Stores every lesson on Walrus Memory. The local file is only a cache:
// delete it and the agent rebuilds what it knows from Walrus.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describeEvent } from './brain.js';

const MARKER = ' [event:';

export function encodeMemory(event) {
  return `${describeEvent(event)}${MARKER}${JSON.stringify(event)}]`;
}

export function decodeMemory(text) {
  const start = text.indexOf(MARKER);
  if (start < 0 || !text.endsWith(']')) return null;
  try {
    const event = JSON.parse(text.slice(start + MARKER.length, -1));
    return event.type && event.at ? event : null;
  } catch {
    return null;
  }
}

export function createMemory({ client, cacheFile, onError = console.error, retryDelayMs = 3000 }) {
  let records = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : [];
  let queue = Promise.resolve();

  function save() {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(records, null, 2));
  }

  async function upload(record) {
    const key = `${record.event.type}-${record.event.at}`;
    // The idempotency key makes a retry safe: the same memory is never stored twice.
    for (let attempt = 1; ; attempt += 1) {
      try {
        const job = await client.remember(encodeMemory(record.event), { idempotencyKey: key });
        const done = await client.waitForRememberJob(job.job_id);
        record.blobId = done.blob_id;
        save();
        return;
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  // Writes one at a time and in order. A failed write stays pending and is retried on sync().
  function enqueue(record) {
    queue = queue.then(() => upload(record)).catch((error) => {
      onError(`Memory not saved yet (${record.event.type}): ${error.message}`);
    });
    return queue;
  }

  return {
    events: () => records.map((record) => record.event),
    records: () => records.map((record) => ({ ...record })),

    record(event) {
      const record = { event, blobId: null };
      records.push(record);
      save();
      enqueue(record);
      return event;
    },

    sync() {
      records.filter((record) => !record.blobId).forEach(enqueue);
      return queue;
    },

    idle: () => queue,

    // Rebuilds the cache from Walrus when it is empty. Returns how many memories came back.
    async restore() {
      if (records.length > 0) return 0;
      const found = await client.recall({
        query: 'user savings rate, bills, data plans and permissions',
        limit: 200,
      });
      records = found.results
        .map((memory) => ({ event: decodeMemory(memory.text), blobId: memory.blob_id }))
        .filter((record) => record.event)
        .sort((a, b) => a.event.at.localeCompare(b.event.at));
      save();
      return records.length;
    },
  };
}
