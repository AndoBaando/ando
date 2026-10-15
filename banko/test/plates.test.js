import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlate, isValidPlate, missingForStage, plateKey } from '../src/plates.js';
import { commitmentFor, drawOrderFromSeed, newSeed } from '../src/fair.js';

test('genererede plader følger altid de danske bankoregler', () => {
  for (let i = 0; i < 3000; i++) {
    const rows = generatePlate();
    assert.ok(isValidPlate(rows), `ugyldig plade: ${JSON.stringify(rows)}`);
  }
});

test('plader er forskellige', () => {
  const keys = new Set(Array.from({ length: 500 }, () => plateKey(generatePlate())));
  assert.ok(keys.size > 495);
});

test('isValidPlate afviser snyd', () => {
  const rows = generatePlate();
  const tooMany = rows.map((r) => [...r]);
  const emptyIdx = tooMany[0].findIndex((n) => n === null);
  tooMany[0][emptyIdx] = 5;
  assert.equal(isValidPlate(tooMany), false);
  const wrongColumn = rows.map((r) => [...r]);
  const idx = wrongColumn[1].findIndex((n) => n !== null);
  wrongColumn[1][idx] = idx === 0 ? 55 : 1;
  assert.equal(isValidPlate(wrongColumn), false);
});

test('missingForStage regner rækker korrekt', () => {
  const rows = [
    [1, null, 21, null, 41, null, 61, null, 81],
    [null, 12, null, 32, null, 52, null, 72, 82],
    [3, 13, 23, 33, 43, null, null, null, null],
  ];
  const drawn = new Set([1, 21, 41, 61, 81, 12, 32]);
  assert.equal(missingForStage(rows, drawn, 1), 0); // række 1 er fuld
  assert.equal(missingForStage(rows, drawn, 2), 3); // række 2 mangler 52, 72, 82
  assert.equal(missingForStage(rows, drawn, 3), 8);
});

test('fair trækning: samme seed giver samme rækkefølge af alle 90 tal', () => {
  const seed = newSeed();
  const a = drawOrderFromSeed(seed);
  assert.deepEqual(a, drawOrderFromSeed(seed));
  assert.deepEqual([...a].sort((x, y) => x - y), Array.from({ length: 90 }, (_, i) => i + 1));
  assert.notDeepEqual(a, drawOrderFromSeed(newSeed()));
  assert.match(commitmentFor(seed), /^[0-9a-f]{64}$/);
});
