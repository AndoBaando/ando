// Spillets tilstand. Serveren er den eneste sandhed: den laver pladerne, trækker tallene og
// afgør om et BANKO-råb er gyldigt. Klienterne får kun deres egne plader at se.
import { randomUUID } from 'node:crypto';
import { generatePlate, plateKey, missingForStage, rowsMissing, STAGES } from './plates.js';
import { newSeed, commitmentFor, drawOrderFromSeed } from './fair.js';
import { validateUsername, usernameKey } from './usernames.js';

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_PLAYERS = 5000;
const MAX_FALSE_CLAIMS = 3;
const BOT_NAMES = [
  'Perle-Lise', 'Glimmer-Gitte', 'Rocaille-Rasmus', 'Delica-Dorte', 'Miyuki-Mette', 'Tråd-Tove',
  'Lås-Lars', 'Krystal-Karen', 'Charm-Charlotte', 'Smykke-Susanne', 'Perlemor-Pia', 'Glasperle-Grete',
  'Ørering-Ole', 'Armbånd-Anne', 'Facet-Frida', 'Seed-Bead-Sanne', 'Hæklenål-Hanne', 'Kæde-Kirsten',
];

const clampInt = (v, lo, hi, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function cleanText(value, max, field, { required = false } = {}) {
  const s = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (required && !s) throw new GameError(`${field} skal udfyldes.`);
  if (s.length > max) throw new GameError(`${field} må højst være ${max} tegn.`);
  return s;
}

function cleanUrl(value, field) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  let url;
  try {
    url = new URL(s);
  } catch {
    throw new GameError(`${field} er ikke et gyldigt link.`);
  }
  if (url.protocol !== 'https:') throw new GameError(`${field} skal starte med https://`);
  return url.toString();
}

function cleanPrice(value, field, { required = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    if (required) throw new GameError(`${field} skal udfyldes.`);
    return null;
  }
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new GameError(`${field} er ikke en gyldig pris.`);
  return Math.round(n * 100) / 100;
}

export class Game {
  constructor({ platesPerPlayer = 2, drawMode = 'digital', autoApprove = false } = {}) {
    this.id = randomUUID();
    this.createdAt = Date.now();
    this.status = 'lobby'; // lobby → running → finished
    this.settings = {
      platesPerPlayer: clampInt(platesPerPlayer, 1, 6, 2),
      drawMode: drawMode === 'manual' ? 'manual' : 'digital',
      autoApprove: Boolean(autoApprove),
    };
    this.seed = newSeed();
    this.commitment = commitmentFor(this.seed);
    this.drawn = [];
    this.stage = 1;
    this.players = new Map();
    this.usernameIndex = new Map();
    this.customerIndex = new Map();
    this.plateKeys = new Set();
    this.claims = [];
    this.winners = [];
    this.offers = [];
    this.lots = [];
    this.reservations = [];
    this.personalCodes = {};
    this.feed = [];
    this.version = 0;
    this.drawOrder = drawOrderFromSeed(this.seed);
  }

  touch() {
    this.version++;
  }

  log(text) {
    this.feed.push({ at: Date.now(), text });
    if (this.feed.length > 50) this.feed.splice(0, this.feed.length - 50);
  }

  get drawnSet() {
    return new Set(this.drawn);
  }

  get joinOpen() {
    return this.status !== 'finished' && this.drawn.length === 0;
  }

  // ---------------------------------------------------------------- spillere

  join({ username, customerId = null, bot = false }) {
    if (customerId) {
      const existingId = this.customerIndex.get(customerId);
      if (existingId) {
        const existing = this.players.get(existingId);
        if (existing.kicked) throw new GameError('Du er desværre blevet fjernet fra dette spil.', 403);
        return existing;
      }
    }
    if (!this.joinOpen) {
      throw new GameError('Tilmeldingen er lukket, fordi første tal er trukket. Vi ses til næste runde!', 409);
    }
    if (this.players.size >= MAX_PLAYERS) throw new GameError('Spillet er fuldt.', 409);

    const check = validateUsername(username);
    if (!check.ok) throw new GameError(check.error);
    const key = usernameKey(check.name);
    if (this.usernameIndex.has(key)) throw new GameError('Det brugernavn er allerede taget i dette spil.', 409);

    const plates = [];
    while (plates.length < this.settings.platesPerPlayer) {
      const rows = generatePlate();
      const k = plateKey(rows);
      if (this.plateKeys.has(k)) continue;
      this.plateKeys.add(k);
      plates.push({ id: randomUUID().slice(0, 8), rows });
    }

    const player = {
      id: randomUUID(),
      username: check.name,
      customerId: customerId || null,
      bot,
      plates,
      joinedAt: Date.now(),
      falseClaims: 0,
      kicked: false,
    };
    this.players.set(player.id, player);
    this.usernameIndex.set(key, player.id);
    if (customerId) this.customerIndex.set(customerId, player.id);
    this.touch();
    return player;
  }

  getActivePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('Ukendt spiller.', 401);
    if (player.kicked) throw new GameError('Du er desværre blevet fjernet fra dette spil.', 403);
    return player;
  }

  addBots(count) {
    const n = clampInt(count, 1, 200, 10);
    let added = 0;
    for (let i = 0; added < n && i < n * 20; i++) {
      const base = BOT_NAMES[i % BOT_NAMES.length];
      const name = i < BOT_NAMES.length ? base : `${base} ${Math.floor(i / BOT_NAMES.length) + 1}`;
      if (this.usernameIndex.has(usernameKey(name))) continue;
      this.join({ username: name, bot: true });
      added++;
    }
    return added;
  }

  kick(playerId) {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('Ukendt spiller.', 404);
    player.kicked = true;
    this.touch();
  }

  rename(playerId, username) {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('Ukendt spiller.', 404);
    const check = validateUsername(username);
    if (!check.ok) throw new GameError(check.error);
    const key = usernameKey(check.name);
    const owner = this.usernameIndex.get(key);
    if (owner && owner !== playerId) throw new GameError('Det brugernavn er allerede taget.', 409);
    this.usernameIndex.delete(usernameKey(player.username));
    this.usernameIndex.set(key, playerId);
    player.username = check.name;
    this.touch();
  }

  // ---------------------------------------------------------------- spilforløb

  start() {
    if (this.status !== 'lobby') throw new GameError('Spillet er allerede startet.', 409);
    this.status = 'running';
    this.log('Spillet er startet. Held og lykke!');
    this.touch();
  }

  draw(manualNumber) {
    if (this.status !== 'running') throw new GameError('Start spillet før der trækkes tal.', 409);
    if (this.drawn.length >= 90) throw new GameError('Alle 90 tal er trukket.', 409);
    let number;
    if (this.settings.drawMode === 'digital') {
      number = this.drawOrder[this.drawn.length];
    } else {
      number = Number.parseInt(manualNumber, 10);
      if (!Number.isInteger(number) || number < 1 || number > 90) throw new GameError('Skriv et tal mellem 1 og 90.');
      if (this.drawn.includes(number)) throw new GameError(`${number} er allerede trukket.`, 409);
    }
    this.drawn.push(number);
    this.touch();
    if (this.settings.autoApprove) this.autoApproveWinners();
    return number;
  }

  /** Fortryd sidste tal — kun i manuel tilstand (tastefejl), og kun hvis ingen har vundet på det. */
  undo() {
    if (this.settings.drawMode !== 'manual') throw new GameError('Digitale trækninger kan ikke fortrydes.', 409);
    if (this.drawn.length === 0) throw new GameError('Der er ingen tal at fortryde.', 409);
    const lastIndex = this.drawn.length;
    if (this.winners.some((w) => w.drawCount === lastIndex)) {
      throw new GameError('Der er allerede godkendt en vinder på dette tal.', 409);
    }
    const removed = this.drawn.pop();
    for (const c of this.claims) {
      if (c.status === 'pending' && c.drawCount === lastIndex) c.status = 'withdrawn';
    }
    this.log(`Tallet ${removed} blev fortrudt (tastefejl).`);
    this.touch();
    return removed;
  }

  bestForPlayer(player, stage = this.stage, drawnSet = this.drawnSet) {
    let best = { missing: Infinity, plateId: null };
    for (const plate of player.plates) {
      const missing = missingForStage(plate.rows, drawnSet, stage);
      if (missing < best.missing) best = { missing, plateId: plate.id };
    }
    return best;
  }

  hasWonStage(playerId, stage = this.stage) {
    return this.winners.some((w) => w.playerId === playerId && w.stage === stage);
  }

  claim(playerId) {
    const player = this.getActivePlayer(playerId);
    if (this.status !== 'running' || this.drawn.length === 0) throw new GameError('Der er ikke trukket nogen tal endnu.', 409);
    if (this.hasWonStage(playerId)) throw new GameError('Du har allerede vundet denne runde.', 409);
    const open = this.claims.find((c) => c.playerId === playerId && c.stage === this.stage && c.status === 'pending');
    if (open) return { valid: true, claim: open };
    if (player.falseClaims >= MAX_FALSE_CLAIMS) {
      throw new GameError('Du har råbt BANKO for mange gange uden gevinst. Kontakt os, hvis det er en fejl.', 429);
    }

    const best = this.bestForPlayer(player);
    if (best.missing > 0) {
      player.falseClaims++;
      this.touch();
      return { valid: false, missing: best.missing };
    }
    const claim = {
      id: randomUUID(),
      playerId,
      username: player.username,
      stage: this.stage,
      plateId: best.plateId,
      drawCount: this.drawn.length,
      status: 'pending',
      at: Date.now(),
    };
    this.claims.push(claim);
    this.log(`${player.username} råber BANKO på ${STAGES[this.stage].label}!`);
    this.touch();
    if (this.settings.autoApprove) this.approveClaim(claim.id);
    return { valid: true, claim };
  }

  approveClaim(claimId) {
    const claim = this.claims.find((c) => c.id === claimId);
    if (!claim) throw new GameError('Ukendt BANKO-råb.', 404);
    if (claim.status !== 'pending') throw new GameError('Råbet er allerede behandlet.', 409);
    if (claim.stage !== this.stage) throw new GameError('Råbet hører til en tidligere runde.', 409);
    const player = this.getActivePlayer(claim.playerId);
    // Tjek igen på serveren — et godkendt råb skal altid være gyldigt.
    const plate = player.plates.find((p) => p.id === claim.plateId);
    if (!plate || missingForStage(plate.rows, this.drawnSet, claim.stage) !== 0) {
      claim.status = 'rejected';
      this.touch();
      throw new GameError('Pladen har ikke gevinst længere.', 409);
    }
    claim.status = 'approved';
    this.winners.push({
      stage: claim.stage,
      playerId: player.id,
      username: player.username,
      plateId: plate.id,
      drawCount: claim.drawCount,
      at: Date.now(),
    });
    this.log(`🏆 ${player.username} vinder ${STAGES[claim.stage].label}!`);
    this.touch();
    return claim;
  }

  rejectClaim(claimId) {
    const claim = this.claims.find((c) => c.id === claimId);
    if (!claim) throw new GameError('Ukendt BANKO-råb.', 404);
    if (claim.status !== 'pending') throw new GameError('Råbet er allerede behandlet.', 409);
    claim.status = 'rejected';
    this.touch();
  }

  /** Godkend en spiller der har gevinst, men ikke selv har trykket BANKO (fx ældre spillere). */
  approvePlayer(playerId) {
    const player = this.getActivePlayer(playerId);
    if (this.hasWonStage(playerId)) throw new GameError('Spilleren har allerede vundet denne runde.', 409);
    const best = this.bestForPlayer(player);
    if (best.missing !== 0) throw new GameError('Spilleren har ikke gevinst.', 409);
    let claim = this.claims.find((c) => c.playerId === playerId && c.stage === this.stage && c.status === 'pending');
    if (!claim) {
      claim = {
        id: randomUUID(),
        playerId,
        username: player.username,
        stage: this.stage,
        plateId: best.plateId,
        drawCount: this.drawn.length,
        status: 'pending',
        at: Date.now(),
      };
      this.claims.push(claim);
    }
    return this.approveClaim(claim.id);
  }

  autoApproveWinners() {
    for (const player of this.players.values()) {
      if (player.kicked || this.hasWonStage(player.id)) continue;
      if (this.bestForPlayer(player).missing === 0) this.approvePlayer(player.id);
    }
  }

  nextStage() {
    if (this.status !== 'running') throw new GameError('Spillet kører ikke.', 409);
    for (const c of this.claims) if (c.status === 'pending' && c.stage === this.stage) c.status = 'closed';
    if (this.stage >= 3) return this.finish();
    this.stage++;
    this.log(`Nu spiller vi om ${STAGES[this.stage].label}!`);
    this.touch();
    if (this.settings.autoApprove) this.autoApproveWinners();
  }

  finish() {
    if (this.status === 'finished') return;
    this.status = 'finished';
    for (const lot of this.lots) if (lot.status === 'open') lot.status = 'closed';
    this.log('Spillet er slut. Tak fordi du spillede med! 💛');
    this.touch();
  }

  setAutoApprove(on) {
    this.settings.autoApprove = Boolean(on);
    if (this.settings.autoApprove && this.status === 'running') this.autoApproveWinners();
    this.touch();
  }

  // ---------------------------------------------------------------- tilbud (pop-ups)

  pushOffer(input, now = Date.now()) {
    const durationSec = clampInt(input.durationSec, 30, 3600, 300);
    const personal = Boolean(input.personal);
    const offer = {
      id: randomUUID().slice(0, 12),
      title: cleanText(input.title, 80, 'Titel', { required: true }),
      text: cleanText(input.text, 280, 'Tekst'),
      price: cleanPrice(input.price, 'Pris'),
      compareAt: cleanPrice(input.compareAt, 'Førpris'),
      url: cleanUrl(input.url, 'Link'),
      imageUrl: cleanUrl(input.imageUrl, 'Billede-link'),
      personal,
      discountPercent: personal ? clampInt(input.discountPercent, 1, 90, 10) : null,
      createdAt: now,
      expiresAt: now + durationSec * 1000,
      ended: false,
    };
    this.offers.push(offer);
    this.log(`⏰ Nyt tilbud: ${offer.title}`);
    this.touch();
    return offer;
  }

  endOffer(offerId) {
    const offer = this.offers.find((o) => o.id === offerId);
    if (!offer) throw new GameError('Ukendt tilbud.', 404);
    offer.ended = true;
    this.touch();
  }

  activeOffers(now = Date.now()) {
    return this.offers.filter((o) => !o.ended && o.expiresAt > now);
  }

  getActiveOffer(offerId, now = Date.now()) {
    const offer = this.activeOffers(now).find((o) => o.id === offerId);
    if (!offer) throw new GameError('Tilbuddet er udløbet.', 410);
    return offer;
  }

  setPersonalCode(offerId, playerId, code) {
    this.personalCodes[`${offerId}:${playerId}`] = code;
    this.touch();
  }

  personalCode(offerId, playerId) {
    return this.personalCodes[`${offerId}:${playerId}`] ?? null;
  }

  // ---------------------------------------------------------------- "Ja tak"-lots med reservation

  openLot(input, now = Date.now()) {
    if (this.status === 'finished') throw new GameError('Spillet er slut.', 409);
    for (const lot of this.lots) if (lot.status === 'open') lot.status = 'closed';
    const qty = clampInt(input.qty, 1, 9999, 1);
    const lot = {
      id: randomUUID().slice(0, 12),
      title: cleanText(input.title, 80, 'Titel', { required: true }),
      price: cleanPrice(input.price, 'Pris', { required: true }),
      compareAt: cleanPrice(input.compareAt, 'Førpris'),
      imageUrl: cleanUrl(input.imageUrl, 'Billede-link'),
      variantId: cleanText(input.variantId, 80, 'Variant-ID'),
      qty,
      initialQty: qty,
      maxPerPlayer: clampInt(input.maxPerPlayer, 1, 10, 1),
      reserveMinutes: clampInt(input.reserveMinutes, 5, 7 * 24 * 60, 48 * 60),
      status: 'open',
      openedAt: now,
    };
    if (lot.variantId && !/^(gid:\/\/shopify\/ProductVariant\/)?\d+$/.test(lot.variantId)) {
      throw new GameError('Variant-ID skal være et tal fra Shopify (eller et gid://shopify/ProductVariant/… id).');
    }
    this.lots.push(lot);
    this.log(`🛍️ Nyt lot: ${lot.title} til ${lot.price} kr. — skriv "Ja tak"!`);
    this.touch();
    return lot;
  }

  closeLot(lotId) {
    const lot = this.lots.find((l) => l.id === lotId);
    if (!lot) throw new GameError('Ukendt lot.', 404);
    lot.status = 'closed';
    this.touch();
  }

  get currentLot() {
    return this.lots.find((l) => l.status === 'open') ?? null;
  }

  reserve(playerId, lotId, now = Date.now()) {
    const player = this.getActivePlayer(playerId);
    const lot = this.lots.find((l) => l.id === lotId);
    if (!lot || lot.status !== 'open') throw new GameError('Lottet er lukket.', 410);
    const mine = this.reservations.filter((r) => r.lotId === lotId && r.playerId === playerId && r.status === 'active');
    if (mine.length >= lot.maxPerPlayer) throw new GameError('Du har allerede reserveret det, du må af dette lot.', 409);
    if (lot.qty <= 0) throw new GameError('Udsolgt! Du var desværre ikke hurtig nok.', 409);
    lot.qty--;
    const reservation = {
      id: randomUUID(),
      lotId,
      playerId,
      username: player.username,
      title: lot.title,
      price: lot.price,
      variantId: lot.variantId || null,
      createdAt: now,
      expiresAt: now + lot.reserveMinutes * 60_000,
      status: 'active',
      checkoutUrl: null,
    };
    this.reservations.push(reservation);
    this.log(`${player.username} sagde Ja tak til ${lot.title}`);
    this.touch();
    return reservation;
  }

  /** Frigiv reservationer der er udløbet. Returnerer true hvis noget ændrede sig. */
  expireReservations(now = Date.now()) {
    let changed = false;
    for (const r of this.reservations) {
      if (r.status === 'active' && r.expiresAt <= now) {
        r.status = 'expired';
        const lot = this.lots.find((l) => l.id === r.lotId);
        if (lot) lot.qty++;
        changed = true;
      }
    }
    if (changed) this.touch();
    return changed;
  }

  // ---------------------------------------------------------------- visninger

  standings() {
    const drawnSet = this.drawnSet;
    const rows = [];
    for (const p of this.players.values()) {
      const best = this.bestForPlayer(p, this.stage, drawnSet);
      const fullRows = Math.max(...p.plates.map((pl) => rowsMissing(pl.rows, drawnSet).filter((m) => m === 0).length));
      const claim = this.claims.find((c) => c.playerId === p.id && c.stage === this.stage && c.status === 'pending');
      rows.push({
        id: p.id,
        username: p.username,
        bot: p.bot,
        linked: Boolean(p.customerId),
        kicked: p.kicked,
        plates: p.plates.length,
        missing: best.missing,
        fullRows,
        falseClaims: p.falseClaims,
        claimed: Boolean(claim),
        wonThisStage: this.hasWonStage(p.id),
        wins: this.winners.filter((w) => w.playerId === p.id).map((w) => w.stage),
      });
    }
    rows.sort((a, b) => Number(a.kicked) - Number(b.kicked) || a.missing - b.missing || a.username.localeCompare(b.username, 'da'));
    return rows;
  }

  publicSnapshot(standings = this.standings(), now = Date.now()) {
    const lot = this.currentLot;
    const active = standings.filter((s) => !s.kicked && !s.wonThisStage);
    return {
      gameId: this.id,
      version: this.version,
      status: this.status,
      joinOpen: this.joinOpen,
      stage: this.stage,
      stageLabel: STAGES[this.stage].label,
      drawMode: this.settings.drawMode,
      platesPerPlayer: this.settings.platesPerPlayer,
      drawn: this.drawn,
      playerCount: standings.filter((s) => !s.kicked).length,
      nearlyCount: this.status === 'running' && this.drawn.length ? active.filter((s) => s.missing === 1).length : 0,
      commitment: this.commitment,
      seed: this.status === 'finished' && this.settings.drawMode === 'digital' ? this.seed : null,
      winners: this.winners.map(({ stage, username, drawCount, at }) => ({ stage, username, drawCount, at })),
      feed: this.feed.slice(-12),
      offers: this.activeOffers(now).map(({ id, title, text, price, compareAt, url, imageUrl, personal, discountPercent, expiresAt }) => ({
        id, title, text, price, compareAt, url, imageUrl, personal, discountPercent, expiresAt,
      })),
      lot: lot && {
        id: lot.id, title: lot.title, price: lot.price, compareAt: lot.compareAt, imageUrl: lot.imageUrl,
        qty: lot.qty, initialQty: lot.initialQty, reserveMinutes: lot.reserveMinutes, maxPerPlayer: lot.maxPerPlayer,
      },
      serverTime: now,
    };
  }

  playerSnapshot(playerId, pub = this.publicSnapshot()) {
    const p = this.players.get(playerId);
    if (!p) return { ...pub, me: null };
    const claim = this.claims.find((c) => c.playerId === p.id && c.stage === this.stage && c.status === 'pending');
    return {
      ...pub,
      me: {
        id: p.id,
        username: p.username,
        linked: Boolean(p.customerId),
        kicked: p.kicked,
        plates: p.plates,
        falseClaims: p.falseClaims,
        claimPending: Boolean(claim),
        wins: this.winners.filter((w) => w.playerId === p.id).map((w) => w.stage),
        reservations: this.reservations
          .filter((r) => r.playerId === p.id && r.status !== 'cancelled')
          .map(({ id, lotId, title, price, expiresAt, status, checkoutUrl }) => ({ id, lotId, title, price, expiresAt, status, checkoutUrl })),
        personalCodes: Object.fromEntries(
          pub.offers.filter((o) => o.personal).map((o) => [o.id, this.personalCode(o.id, p.id)]).filter(([, code]) => code),
        ),
      },
    };
  }

  adminSnapshot(standings = this.standings(), now = Date.now()) {
    return {
      ...this.publicSnapshot(standings, now),
      settings: this.settings,
      players: standings,
      claims: this.claims.filter((c) => c.status === 'pending' || now - c.at < 10 * 60_000).slice(-50),
      allOffers: this.offers.slice(-20),
      lots: this.lots.slice(-30),
      reservations: this.reservations.slice(-300),
      unclaimedWinners: standings.filter((s) => !s.kicked && s.missing === 0 && !s.claimed && !s.wonThisStage).length,
    };
  }

  // ---------------------------------------------------------------- persistens

  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      status: this.status,
      settings: this.settings,
      seed: this.seed,
      drawn: this.drawn,
      stage: this.stage,
      players: [...this.players.values()],
      claims: this.claims,
      winners: this.winners,
      offers: this.offers,
      lots: this.lots,
      reservations: this.reservations,
      personalCodes: this.personalCodes,
      feed: this.feed,
      version: this.version,
    };
  }

  static fromJSON(data) {
    const game = new Game(data.settings);
    Object.assign(game, {
      id: data.id,
      createdAt: data.createdAt,
      status: data.status,
      seed: data.seed,
      commitment: commitmentFor(data.seed),
      drawOrder: drawOrderFromSeed(data.seed),
      drawn: data.drawn,
      stage: data.stage,
      claims: data.claims,
      winners: data.winners,
      offers: data.offers,
      lots: data.lots,
      reservations: data.reservations,
      personalCodes: data.personalCodes ?? {},
      feed: data.feed ?? [],
      version: data.version ?? 0,
    });
    game.plateKeys = new Set();
    for (const p of data.players) {
      game.players.set(p.id, p);
      game.usernameIndex.set(usernameKey(p.username), p.id);
      if (p.customerId) game.customerIndex.set(p.customerId, p.id);
      for (const plate of p.plates) game.plateKeys.add(plateKey(plate.rows));
    }
    return game;
  }
}
