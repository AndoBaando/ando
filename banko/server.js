// Uniq Perler Banko — server uden eksterne afhængigheder (kun Node.js).
// Live-opdateringer sendes med Server-Sent Events (SSE), og alle handlinger er almindelige POST-kald.
import http from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game, GameError } from './src/game.js';
import { createTokenSigner, safeEqual, bearerToken, RateLimiter } from './src/auth.js';
import { verifyAppProxy, createShopifyClient } from './src/shopify.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, '');
const SHOP_URL = (process.env.SHOP_URL || 'https://www.uniqperler.com').replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const REQUIRE_SHOPIFY_LOGIN = process.env.REQUIRE_SHOPIFY_LOGIN === '1';
const SHOPIFY_APP_SECRET = process.env.SHOPIFY_APP_SECRET || '';

mkdirSync(path.join(DATA_DIR, 'history'), { recursive: true });

// ------------------------------------------------------------------ hemmeligheder

function loadOrCreateSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, 'session-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(48).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (PRODUCTION && ADMIN_PASSWORD.length < 12) {
  console.error('ADMIN_PASSWORD skal være sat og mindst 12 tegn i produktion.');
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = randomBytes(9).toString('base64url');
  console.log(`\n  Admin-kodeord (kun til denne kørsel): ${ADMIN_PASSWORD}\n  Sæt ADMIN_PASSWORD for at vælge dit eget.\n`);
}

const signer = createTokenSigner(loadOrCreateSecret());
const shopify = createShopifyClient({
  shop: process.env.SHOPIFY_SHOP,
  accessToken: process.env.SHOPIFY_ADMIN_TOKEN,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: SHOPIFY_APP_SECRET,
  apiVersion: process.env.SHOPIFY_API_VERSION || '2026-10',
});

// ------------------------------------------------------------------ tilstand + persistens

const GAME_FILE = path.join(DATA_DIR, 'game.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  writeFileSync(`${file}.tmp`, JSON.stringify(data));
  renameSync(`${file}.tmp`, file);
}

let game = (() => {
  const saved = readJsonFile(GAME_FILE, null);
  if (!saved) return new Game();
  try {
    return Game.fromJSON(saved);
  } catch (err) {
    console.error('Kunne ikke indlæse gemt spil — starter et nyt.', err);
    return new Game();
  }
})();
const profiles = readJsonFile(PROFILES_FILE, {}); // Shopify customerId → { username }
const usedLinkTokens = new Map(); // jti → exp

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      writeJsonAtomic(GAME_FILE, game.toJSON());
    } catch (err) {
      console.error('Kunne ikke gemme spillet', err);
    }
  }, 300);
}

// ------------------------------------------------------------------ live-opdateringer (SSE)

const streams = new Set();
const streamsPerIp = new Map();
let flushScheduled = false;

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast() {
  saveSoon();
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(() => {
    flushScheduled = false;
    const standings = game.standings();
    const pub = game.publicSnapshot(standings);
    let admin = null;
    for (const s of streams) {
      if (s.kind === 'admin') {
        sse(s.res, 'state', (admin ??= game.adminSnapshot(standings)));
      } else if (s.kind === 'player') {
        if (s.gameId !== game.id) {
          sse(s.res, 'rejoin', { reason: 'Et nyt spil er startet.' });
          s.res.end();
        } else {
          sse(s.res, 'state', game.playerSnapshot(s.playerId, pub));
        }
      } else {
        sse(s.res, 'state', pub);
      }
    }
  });
}

function openStream(req, res, info) {
  const ip = clientIp(req);
  const count = streamsPerIp.get(ip) ?? 0;
  if (count >= 12 || streams.size >= 20_000) return sendJson(res, 429, { error: 'For mange åbne forbindelser.' });
  streamsPerIp.set(ip, count + 1);

  res.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const stream = { res, ...info };
  streams.add(stream);
  const standings = game.standings();
  if (info.kind === 'admin') sse(res, 'state', game.adminSnapshot(standings));
  else if (info.kind === 'player') sse(res, 'state', game.playerSnapshot(info.playerId, game.publicSnapshot(standings)));
  else sse(res, 'state', game.publicSnapshot(standings));

  req.on('close', () => {
    streams.delete(stream);
    const left = (streamsPerIp.get(ip) ?? 1) - 1;
    if (left <= 0) streamsPerIp.delete(ip);
    else streamsPerIp.set(ip, left);
  });
}

setInterval(() => {
  for (const s of streams) s.res.write(': ping\n\n');
}, 25_000).unref();

setInterval(() => {
  const now = Date.now();
  let changed = game.expireReservations(now);
  if (game.offers.some((o) => !o.ended && !o.expiredBroadcast && o.expiresAt <= now)) {
    for (const o of game.offers) if (o.expiresAt <= now) o.expiredBroadcast = true;
    changed = true;
  }
  for (const [jti, exp] of usedLinkTokens) if (exp * 1000 < now) usedLinkTokens.delete(jti);
  if (changed) broadcast();
}, 5_000).unref();

// ------------------------------------------------------------------ Shopify-synkronisering

const syncQueues = new Map();

function syncReservationsToShopify(playerId) {
  const player = game.players.get(playerId);
  if (!shopify || !player?.customerId) return;
  const gameRef = game;
  const run = async () => {
    const active = gameRef.reservations.filter((r) => r.playerId === playerId && r.status === 'active' && r.variantId);
    if (!active.length) return;
    const lines = new Map();
    for (const r of active) {
      const key = `${r.variantId}|${r.price}`;
      const line = lines.get(key) ?? { variantId: r.variantId, price: r.price, quantity: 0 };
      line.quantity++;
      lines.set(key, line);
    }
    try {
      const draft = await shopify.upsertReservationDraft({
        draftOrderId: player.draftOrderId,
        customerId: player.customerId,
        lines: [...lines.values()],
        reserveUntil: Math.max(...active.map((r) => r.expiresAt)),
      });
      player.draftOrderId = draft.id;
      for (const r of active) {
        r.checkoutUrl = draft.invoiceUrl;
        r.syncError = false;
      }
    } catch (err) {
      console.error('Shopify-reservation fejlede', err.message);
      for (const r of active) r.syncError = true;
    }
    gameRef.touch();
    broadcast();
  };
  const next = (syncQueues.get(playerId) ?? Promise.resolve()).then(run);
  syncQueues.set(playerId, next);
  next.finally(() => {
    if (syncQueues.get(playerId) === next) syncQueues.delete(playerId);
  });
}

// ------------------------------------------------------------------ HTTP-hjælpere

function securityHeaders() {
  const headers = {
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; " +
      "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (PRODUCTION) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

function sendJson(res, status, data) {
  res.writeHead(status, { ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

async function readBody(req) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) throw new GameError('Forventede JSON.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw new GameError('For stor forespørgsel.', 413);
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    throw new GameError('Ugyldig JSON.', 400);
  }
}

const limits = {
  join: new RateLimiter({ windowMs: 10 * 60_000, max: 10 }),
  adminLogin: new RateLimiter({ windowMs: 15 * 60_000, max: 5 }),
  claim: new RateLimiter({ windowMs: 60_000, max: 10 }),
  jaTak: new RateLimiter({ windowMs: 60_000, max: 30 }),
  offer: new RateLimiter({ windowMs: 60_000, max: 10 }),
};

function limit(limiter, key) {
  if (!limiter.hit(key)) throw new GameError('Du går lidt for hurtigt frem — prøv igen om lidt.', 429);
}

function requirePlayer(req) {
  const payload = signer.verify(bearerToken(req));
  if (!payload || payload.role !== 'player') throw new GameError('Log ind igen.', 401);
  if (payload.gid !== game.id) throw Object.assign(new GameError('Et nyt spil er startet.', 401), { code: 'rejoin' });
  return game.getActivePlayer(payload.sub);
}

function requireAdmin(req) {
  const payload = signer.verify(bearerToken(req));
  if (!payload || payload.role !== 'admin') throw new GameError('Log ind som admin.', 401);
  return payload;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveFile(res, relative) {
  const file = path.normalize(path.join(PUBLIC_DIR, relative));
  const type = MIME[path.extname(file)];
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !type) return sendJson(res, 404, { error: 'Ikke fundet' });
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': type,
      'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'no-cache',
    });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Ikke fundet' });
  }
}

// ------------------------------------------------------------------ ruter

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/$/, (req, res) => serveFile(res, 'index.html'));
route('GET', /^\/admin\/?$/, (req, res) => serveFile(res, 'admin.html'));
route('GET', /^\/skaerm\/?$/, (req, res) => serveFile(res, 'display.html'));
route('GET', /^\/static\/([\w.-]+)$/, (req, res, [file]) => serveFile(res, file));
route('GET', /^\/healthz$/, (req, res) => sendJson(res, 200, { ok: true }));

// Indgang via Shopify App Proxy (uniqperler.com/apps/banko → /proxy). Se README.
route('GET', /^\/proxy\/?$/, (req, res, _m, url) => {
  const result = verifyAppProxy(url.searchParams, SHOPIFY_APP_SECRET);
  if (!result.valid) return sendJson(res, 403, { error: 'Ugyldig forespørgsel fra webshoppen.' });
  if (!result.customerId) {
    const login = `${SHOP_URL}/account/login?return_url=${encodeURIComponent(url.searchParams.get('path_prefix') || '/apps/banko')}`;
    res.writeHead(302, { Location: login, 'Cache-Control': 'no-store' });
    return res.end();
  }
  const link = signer.sign({ role: 'link', cid: result.customerId }, 600);
  res.writeHead(302, { Location: `${PUBLIC_ORIGIN}/?link=${encodeURIComponent(link)}`, 'Cache-Control': 'no-store' });
  res.end();
});

route('GET', /^\/api\/config$/, (req, res) =>
  sendJson(res, 200, {
    shopifyLinking: Boolean(SHOPIFY_APP_SECRET),
    requireShopifyLogin: REQUIRE_SHOPIFY_LOGIN,
    shopLoginUrl: `${SHOP_URL}/apps/banko`,
    demo: !shopify,
  }),
);

function readLinkToken(linkToken) {
  if (!linkToken) return null;
  const payload = signer.verify(String(linkToken));
  if (!payload || payload.role !== 'link' || usedLinkTokens.has(payload.jti)) return null;
  return payload;
}

route('POST', /^\/api\/link\/peek$/, async (req, res) => {
  const { linkToken } = await readBody(req);
  const link = readLinkToken(linkToken);
  if (!link) return sendJson(res, 200, { linked: false });
  sendJson(res, 200, { linked: true, suggestedUsername: profiles[link.cid]?.username ?? '' });
});

route('POST', /^\/api\/join$/, async (req, res) => {
  limit(limits.join, clientIp(req));
  const { username, linkToken } = await readBody(req);
  const link = readLinkToken(linkToken);
  if (linkToken && !link) throw new GameError('Dit login-link er udløbet. Åbn banko igen via webshoppen.', 401);
  if (REQUIRE_SHOPIFY_LOGIN && !link) throw new GameError('Log ind med din Uniq Perler-konto for at spille med.', 403);

  const player = game.join({ username, customerId: link?.cid ?? null });
  if (link) {
    usedLinkTokens.set(link.jti, link.exp);
    profiles[link.cid] = { username: player.username };
    writeJsonAtomic(PROFILES_FILE, profiles);
  }
  const token = signer.sign({ role: 'player', sub: player.id, gid: game.id }, 24 * 3600);
  broadcast();
  sendJson(res, 200, { token });
});

route('GET', /^\/api\/stream$/, (req, res) => {
  const player = requirePlayer(req);
  openStream(req, res, { kind: 'player', playerId: player.id, gameId: game.id });
});

route('GET', /^\/api\/stream\/public$/, (req, res) => openStream(req, res, { kind: 'public' }));

route('POST', /^\/api\/claim$/, async (req, res) => {
  const player = requirePlayer(req);
  limit(limits.claim, player.id);
  const result = game.claim(player.id);
  broadcast();
  sendJson(res, 200, { valid: result.valid, missing: result.missing ?? 0, approved: result.claim?.status === 'approved' });
});

route('POST', /^\/api\/lots\/([\w-]+)\/ja-tak$/, async (req, res, [lotId]) => {
  const player = requirePlayer(req);
  limit(limits.jaTak, player.id);
  const reservation = game.reserve(player.id, lotId);
  broadcast();
  if (reservation.variantId) syncReservationsToShopify(player.id);
  sendJson(res, 200, { ok: true, expiresAt: reservation.expiresAt });
});

route('POST', /^\/api\/offers\/([\w-]+)\/activate$/, async (req, res, [offerId]) => {
  const player = requirePlayer(req);
  limit(limits.offer, player.id);
  const offer = game.getActiveOffer(offerId);
  if (!offer.personal) throw new GameError('Dette tilbud har ingen personlig kode.');
  let code = game.personalCode(offer.id, player.id);
  if (!code) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = `BANKO-${Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;
    if (shopify) {
      if (!player.customerId) throw new GameError('Log ind med din Uniq Perler-konto for at få din personlige kode.', 403);
      await shopify.createPersonalDiscount({
        customerId: player.customerId,
        code,
        percentage: offer.discountPercent,
        endsAt: offer.expiresAt + 15 * 60_000,
        title: `Banko: ${offer.title} (${player.username})`,
      });
    }
    game.setPersonalCode(offer.id, player.id, code);
    broadcast();
  }
  sendJson(res, 200, { code, demo: !shopify });
});

// --- admin

route('POST', /^\/api\/admin\/login$/, async (req, res) => {
  limit(limits.adminLogin, clientIp(req));
  const { password } = await readBody(req);
  if (!safeEqual(password ?? '', ADMIN_PASSWORD)) throw new GameError('Forkert kodeord.', 401);
  sendJson(res, 200, { token: signer.sign({ role: 'admin' }, 12 * 3600) });
});

route('GET', /^\/api\/admin\/stream$/, (req, res) => {
  requireAdmin(req);
  openStream(req, res, { kind: 'admin' });
});

const adminActions = {
  'game/new': (body) => {
    writeJsonAtomic(path.join(DATA_DIR, 'history', `${game.id}.json`), game.toJSON());
    game = new Game({ platesPerPlayer: body.platesPerPlayer, drawMode: body.drawMode, autoApprove: body.autoApprove });
  },
  'game/start': () => game.start(),
  'game/finish': () => game.finish(),
  draw: (body) => ({ number: game.draw(body.number) }),
  undo: () => ({ number: game.undo() }),
  'stage/next': () => game.nextStage(),
  settings: (body) => game.setAutoApprove(body.autoApprove),
  bots: (body) => ({ added: game.addBots(body.count) }),
  offers: (body) => ({ id: game.pushOffer(body).id }),
  lots: (body) => ({ id: game.openLot(body).id }),
};

const adminItemActions = {
  claims: { approve: (id) => game.approveClaim(id), reject: (id) => game.rejectClaim(id) },
  players: {
    approve: (id) => game.approvePlayer(id),
    kick: (id) => game.kick(id),
    rename: (id, body) => game.rename(id, body.username),
  },
  offers: { end: (id) => game.endOffer(id) },
  lots: { close: (id) => game.closeLot(id) },
};

route('POST', /^\/api\/admin\/([a-z]+(?:\/[a-z]+)?)$/, async (req, res, [action]) => {
  requireAdmin(req);
  const handler = adminActions[action];
  if (!handler) return sendJson(res, 404, { error: 'Ukendt handling' });
  const body = await readBody(req);
  const result = handler(body) ?? {};
  broadcast();
  sendJson(res, 200, { ok: true, ...result });
});

route('POST', /^\/api\/admin\/([a-z]+)\/([\w-]+)\/([a-z]+)$/, async (req, res, [kind, id, action]) => {
  requireAdmin(req);
  const handler = adminItemActions[kind]?.[action];
  if (!handler) return sendJson(res, 404, { error: 'Ukendt handling' });
  const body = await readBody(req);
  handler(id, body);
  broadcast();
  sendJson(res, 200, { ok: true });
});

// ------------------------------------------------------------------ server

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const match = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
  if (!match) return sendJson(res, 404, { error: 'Ikke fundet' });
  try {
    await match.handler(req, res, match.pattern.exec(url.pathname).slice(1), url);
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err instanceof GameError) return sendJson(res, err.status, { error: err.message, code: err.code });
    console.error(err);
    sendJson(res, 500, { error: 'Der skete en fejl. Prøv igen.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Banko kører på ${PUBLIC_ORIGIN}`);
  console.log(`  Spillere:  ${PUBLIC_ORIGIN}/`);
  console.log(`  Admin:     ${PUBLIC_ORIGIN}/admin`);
  console.log(`  Skærm/OBS: ${PUBLIC_ORIGIN}/skaerm`);
  console.log(`  Shopify:   ${shopify ? 'tilsluttet' : 'demo-tilstand (ikke tilsluttet)'}`);
});
