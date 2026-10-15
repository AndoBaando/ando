// Danske bankoplader: 3 rækker × 9 kolonner, 5 tal pr. række (15 tal i alt).
// Kolonne 1 rummer 1-9, kolonne 2 10-19 … kolonne 9 80-90. Hver kolonne har 1-3 tal,
// sorteret stigende oppefra og ned.
import { randomInt } from 'node:crypto';

export const ROWS = 3;
export const COLS = 9;
export const NUMBERS_PER_ROW = 5;
export const COLUMN_RANGES = [
  [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
  [50, 59], [60, 69], [70, 79], [80, 90],
];

// Antal rækker der skal være fulde for at vinde hvert trin.
export const STAGES = {
  1: { rows: 1, label: '1 række' },
  2: { rows: 2, label: '2 rækker' },
  3: { rows: 3, label: 'Fuld plade' },
};

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fordeler kolonnernes tal på rækkerne, så hver række får præcis 5.
// Kolonner med flest tal placeres først i de rækker med mest plads tilbage.
function layoutRows(counts, rand) {
  const remaining = [NUMBERS_PER_ROW, NUMBERS_PER_ROW, NUMBERS_PER_ROW];
  const layout = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const order = shuffle([...Array(COLS).keys()], rand).sort((a, b) => counts[b] - counts[a]);
  for (const c of order) {
    const rowsByCapacity = shuffle([0, 1, 2], rand).sort((a, b) => remaining[b] - remaining[a]);
    for (const r of rowsByCapacity.slice(0, counts[c])) {
      if (remaining[r] === 0) return null;
      layout[r][c] = true;
      remaining[r]--;
    }
  }
  return remaining.every((x) => x === 0) ? layout : null;
}

/** Returnerer en plade som 3 rækker á 9 felter (tal eller null). */
export function generatePlate(rand = randomInt) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const counts = Array(COLS).fill(1);
    let extra = ROWS * NUMBERS_PER_ROW - COLS;
    while (extra > 0) {
      const c = rand(COLS);
      if (counts[c] < ROWS) {
        counts[c]++;
        extra--;
      }
    }
    const layout = layoutRows(counts, rand);
    if (!layout) continue;

    const rows = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let c = 0; c < COLS; c++) {
      const [lo, hi] = COLUMN_RANGES[c];
      const pool = [];
      for (let n = lo; n <= hi; n++) pool.push(n);
      const picked = shuffle(pool, rand).slice(0, counts[c]).sort((a, b) => a - b);
      let k = 0;
      for (let r = 0; r < ROWS; r++) if (layout[r][c]) rows[r][c] = picked[k++];
    }
    return rows;
  }
  throw new Error('Kunne ikke generere en gyldig plade');
}

export function plateKey(rows) {
  return rows.flat().filter((n) => n !== null).join(',');
}

/** Tjekker at en plade overholder alle regler. Bruges i tests og som sikkerhedsnet. */
export function isValidPlate(rows) {
  if (!Array.isArray(rows) || rows.length !== ROWS) return false;
  const seen = new Set();
  for (const row of rows) {
    if (row.length !== COLS) return false;
    if (row.filter((n) => n !== null).length !== NUMBERS_PER_ROW) return false;
  }
  for (let c = 0; c < COLS; c++) {
    const [lo, hi] = COLUMN_RANGES[c];
    const col = rows.map((row) => row[c]).filter((n) => n !== null);
    if (col.length < 1 || col.length > ROWS) return false;
    for (let i = 0; i < col.length; i++) {
      const n = col[i];
      if (!Number.isInteger(n) || n < lo || n > hi || seen.has(n)) return false;
      if (i > 0 && col[i - 1] >= n) return false;
      seen.add(n);
    }
  }
  return true;
}

/** Antal manglende tal i hver række, givet de trukne tal. */
export function rowsMissing(rows, drawnSet) {
  return rows.map((row) => row.filter((n) => n !== null && !drawnSet.has(n)).length);
}

/** Hvor mange tal mangler pladen for at vinde trinnet (0 = gevinst). */
export function missingForStage(rows, drawnSet, stage) {
  const need = STAGES[stage].rows;
  return rowsMissing(rows, drawnSet)
    .sort((a, b) => a - b)
    .slice(0, need)
    .reduce((sum, x) => sum + x, 0);
}
