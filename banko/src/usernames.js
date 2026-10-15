// Validering af spillernavne. Navnene vises for alle spillere, så de skal være pæne og
// må ikke kunne forveksles med hinanden eller med Uniq Perlers egne folk.
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

// Bevidst kort liste — udvid den efter behov. Admin kan altid omdøbe eller smide en spiller ud.
const BLOCKED_WORDS = [
  'admin', 'uniqperler', 'uniq perler', 'moderator', 'support',
  'fuck', 'shit', 'lort', 'fisse', 'kusse', 'luder', 'nazi', 'hitler',
  'neger', 'perker', 'bøsserøv', 'idiot', 'spasser', 'mongol',
];

export function normalizeUsername(raw) {
  return String(raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function usernameKey(name) {
  return normalizeUsername(name).toLocaleLowerCase('da-DK').replace(/[ ._-]/g, '');
}

/** Returnerer { ok: true, name } eller { ok: false, error } med en dansk fejltekst. */
export function validateUsername(raw) {
  const name = normalizeUsername(raw);
  if (name.length < 3) return { ok: false, error: 'Brugernavnet skal være mindst 3 tegn.' };
  if (name.length > 20) return { ok: false, error: 'Brugernavnet må højst være 20 tegn.' };
  if (!ALLOWED.test(name)) {
    return { ok: false, error: 'Brug kun bogstaver, tal, mellemrum, punktum, bindestreg og understreg.' };
  }
  const flat = name.toLocaleLowerCase('da-DK').replace(/[ ._-]/g, '');
  if (BLOCKED_WORDS.some((w) => flat.includes(w.replace(/[ ._-]/g, '')))) {
    return { ok: false, error: 'Det brugernavn kan desværre ikke bruges. Prøv et andet.' };
  }
  return { ok: true, name };
}
