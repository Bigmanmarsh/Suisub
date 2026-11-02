// VTpass data bundle API: https://vtpass.com/documentation/mtn-data/
import { randomBytes } from 'node:crypto';

// VTpass requires the first 12 characters to be the current Lagos date and time.
export function requestId(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  const stamp = `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`;
  return `${stamp}${randomBytes(6).toString('hex')}`;
}

export function createVtpass({ baseUrl, apiKey, publicKey, secretKey, fetchFn = fetch }) {
  return {
    async plans(service) {
      const url = `${baseUrl}/service-variations?serviceID=${encodeURIComponent(service)}`;
      const response = await fetchFn(url, {
        headers: { 'api-key': apiKey, 'public-key': publicKey },
      });
      if (!response.ok) throw new Error(`VTpass plans returned HTTP ${response.status}`);
      const body = await response.json();
      const plans = body.content?.variations ?? body.content?.varations;
      if (!plans) throw new Error('VTpass returned no plans');
      return plans;
    },

    // Returns delivered, pending or failed. Never reports success without "delivered".
    async buy({ service, planCode, phone }) {
      const id = requestId();
      const response = await fetchFn(`${baseUrl}/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'api-key': apiKey, 'secret-key': secretKey },
        body: JSON.stringify({
          request_id: id,
          serviceID: service,
          billersCode: phone,
          variation_code: planCode,
          phone,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const body = await response.json().catch(() => ({}));
      const status = body.content?.transactions?.status;
      if (body.code === '000' && status === 'delivered') return { status: 'delivered', requestId: id };
      if (status === 'pending' || status === 'initiated' || body.code === '099') return { status: 'pending', requestId: id };
      return { status: 'failed', requestId: id, reason: body.response_description ?? `HTTP ${response.status}` };
    },
  };
}
