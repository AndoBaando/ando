// Efterregn en digital trækning: node scripts/verify-draw.js <seed> [<offentliggjort hash>]
import { commitmentFor, drawOrderFromSeed } from '../src/fair.js';

const [seed, publishedHash] = process.argv.slice(2);
if (!seed || !/^[0-9a-f]{64}$/i.test(seed)) {
  console.error('Brug: node scripts/verify-draw.js <seed (64 hex-tegn)> [<offentliggjort hash>]');
  process.exit(1);
}
const hash = commitmentFor(seed);
console.log(`SHA-256 af seed: ${hash}`);
if (publishedHash) {
  console.log(hash === publishedHash.toLowerCase() ? '✓ Matcher den offentliggjorte hash' : '✗ Matcher IKKE den offentliggjorte hash');
}
console.log(`Trækningsrækkefølge: ${drawOrderFromSeed(seed).join(', ')}`);
