// The owner's phone number for bundle delivery. It stays in a local file and is never
// stored on Walrus, because the memory relayer can read what it stores.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Accepts 0803 123 4567, +234 803 123 4567 or 2348031234567, and returns 08031234567.
export function normalizePhone(text) {
  const digits = String(text).replace(/[\s()-]/g, '').replace(/^\+/, '');
  const local = digits.startsWith('234') ? `0${digits.slice(3)}` : digits;
  return /^0[789][01]\d{8}$/.test(local) ? local : null;
}

export function phoneStore(file, fallback = null) {
  let phone = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).phone : fallback;
  return {
    get: () => phone,
    set(value) {
      phone = value;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ phone }));
    },
  };
}

// Shows enough to recognise the number without exposing it in full.
export const maskPhone = (phone) => `${phone.slice(0, 4)}****${phone.slice(-3)}`;
