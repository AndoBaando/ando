// "Fair trækning" (provably fair): Før spillet starter offentliggøres SHA-256 af et hemmeligt
// seed. Rækkefølgen af alle 90 tal er bestemt af seedet. Når spillet er slut, afsløres seedet,
// og alle kan selv efterregne at tallene ikke er blevet ændret undervejs
// (se scripts/verify-draw.js).
import { createHash, createHmac, randomBytes } from 'node:crypto';

export function newSeed() {
  return randomBytes(32).toString('hex');
}

export function commitmentFor(seedHex) {
  return createHash('sha256').update(seedHex, 'utf8').digest('hex');
}

function byteStream(seedHex) {
  let counter = 0;
  let buf = Buffer.alloc(0);
  return function nextUint32() {
    if (buf.length < 4) {
      const block = createHmac('sha256', Buffer.from(seedHex, 'hex')).update(`banko:${counter++}`).digest();
      buf = Buffer.concat([buf, block]);
    }
    const value = buf.readUInt32BE(0);
    buf = buf.subarray(4);
    return value;
  };
}

/** Deterministisk blanding (Fisher-Yates) af 1-90 ud fra seedet. */
export function drawOrderFromSeed(seedHex) {
  const next = byteStream(seedHex);
  const randBelow = (n) => {
    const limit = Math.floor(0x100000000 / n) * n; // undgå skævhed (rejection sampling)
    let x;
    do x = next(); while (x >= limit);
    return x % n;
  };
  const order = Array.from({ length: 90 }, (_, i) => i + 1);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randBelow(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
