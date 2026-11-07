// Runs only the public pages on this computer, from the local memory cache, so they can be
// checked without starting a second Telegram bot.
import { createMemory } from '../src/memory.js';
import { startPage } from '../src/page.js';
import { createVtpass } from '../src/vtpass.js';

const memory = createMemory({ client: {}, cacheFile: 'data/memories.json' });
const vtpass = createVtpass({ baseUrl: 'https://sandbox.vtpass.com/api' });
startPage({ memory, port: 4031, isPublic: true, getPlans: (service) => vtpass.plans(service) });
console.log('Page preview on http://localhost:4031');
