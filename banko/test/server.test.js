// Ende-til-ende: starter den rigtige server og taler med den over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 40000 + Math.floor(Math.random() * 10000);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASSWORD = 'test-kodeord-1234';
const PROXY_SECRET = 'proxy-secret';
let server;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'banko-test-'));
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_PASSWORD, DATA_DIR: dataDir, SHOPIFY_APP_SECRET: PROXY_SECRET, PUBLIC_ORIGIN: BASE },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => d.toString().includes('Banko kører') && resolve());
    server.on('exit', (code) => reject(new Error(`server stoppede (${code})`)));
  });
});

after(async () => {
  if (server && server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve).kill());
  rmSync(dataDir, { recursive: true, force: true });
});

const post = (p, body, token) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
    redirect: 'manual',
  });

async function firstEvent(p, token) {
  const controller = new AbortController();
  const res = await fetch(BASE + p, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
  assert.equal(res.status, 200);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (!buffer.includes('event: state')) buffer += (await reader.read()).value;
  while (!/event: state\ndata: .*\n\n/.test(buffer)) buffer += (await reader.read()).value;
  controller.abort();
  return JSON.parse(buffer.match(/event: state\ndata: (.*)\n\n/)[1]);
}

function proxyQuery(customerId, secret = PROXY_SECRET) {
  const params = new URLSearchParams({ shop: 'uniqperler.myshopify.com', logged_in_customer_id: customerId, path_prefix: '/apps/banko', timestamp: String(Math.floor(Date.now() / 1000)) });
  const message = [...params].map(([k, v]) => `${k}=${v}`).sort().join('');
  params.set('signature', createHmac('sha256', secret).update(message).digest('hex'));
  return params;
}

test('sider leveres med sikkerheds-headers, og filer udenfor public/ kan ikke hentes', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/static/../server.js', '/static/%2e%2e/server.js', '/static/..%2fserver.js', '/data/session-secret']) {
    assert.equal((await fetch(BASE + p)).status, 404, p);
  }
});

test('admin kræver kodeord, og spillere kan ikke kalde admin-handlinger', async () => {
  assert.equal((await post('/api/admin/game/start', {})).status, 401);
  assert.equal((await post('/api/admin/login', { password: 'forkert' })).status, 401);
  const { token: admin } = await (await post('/api/admin/login', { password: ADMIN_PASSWORD })).json();
  assert.ok(admin);

  const { token: player } = await (await post('/api/join', { username: 'Snydepels' })).json();
  assert.equal((await post('/api/admin/draw', {}, player)).status, 401);
  assert.equal((await post('/api/claim', {}, admin)).status, 401);
});

test('JSON kræves, og ugyldige navne afvises med en dansk fejl', async () => {
  const res = await fetch(`${BASE}/api/join`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'username=x' });
  assert.equal(res.status, 415);
  const bad = await post('/api/join', { username: 'x' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /mindst 3 tegn/);
});

test('spiller får sine plader via stream — men aldrig andres', async () => {
  const { token: a } = await (await post('/api/join', { username: 'Anna' })).json();
  const { token: b } = await (await post('/api/join', { username: 'Bente' })).json();
  const snapA = await firstEvent('/api/stream', a);
  const snapB = await firstEvent('/api/stream', b);
  assert.equal(snapA.me.username, 'Anna');
  assert.equal(snapA.me.plates.length, 2);
  const raw = JSON.stringify(snapA);
  for (const plate of snapB.me.plates) assert.ok(!raw.includes(`"${plate.id}"`));
  const pub = await firstEvent('/api/stream/public');
  assert.equal(pub.me, undefined);
  assert.ok(!JSON.stringify(pub).includes('"plates":'));
});

test('Shopify app proxy kobler kundekontoen sikkert, og login-linket kan kun bruges én gang', async () => {
  const forged = proxyQuery('999', 'forkert-secret');
  assert.equal((await fetch(`${BASE}/proxy?${forged}`, { redirect: 'manual' })).status, 403);

  const res = await fetch(`${BASE}/proxy?${proxyQuery('6123456789')}`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const link = new URL(res.headers.get('location')).searchParams.get('link');
  assert.ok(link);

  const peek = await (await post('/api/link/peek', { linkToken: link })).json();
  assert.equal(peek.linked, true);
  const joined = await post('/api/join', { username: 'Kunde-Karen', linkToken: link });
  assert.equal(joined.status, 200);
  const snap = await firstEvent('/api/stream', (await joined.json()).token);
  assert.equal(snap.me.linked, true);
  assert.equal((await post('/api/join', { username: 'Kunde-Karen2', linkToken: link })).status, 401);

  const notLoggedIn = await fetch(`${BASE}/proxy?${proxyQuery('')}`, { redirect: 'manual' });
  assert.equal(notLoggedIn.status, 302);
  assert.match(notLoggedIn.headers.get('location'), /\/account\/login/);
});

test('fuldt forløb over HTTP: start, træk, falsk råb, Ja tak', async () => {
  const { token: admin } = await (await post('/api/admin/login', { password: ADMIN_PASSWORD })).json();
  const { token: player } = await (await post('/api/join', { username: 'Hurtige Hanne' })).json();
  assert.equal((await post('/api/admin/game/start', {}, admin)).status, 200);
  const draw = await (await post('/api/admin/draw', {}, admin)).json();
  assert.ok(draw.number >= 1 && draw.number <= 90);
  assert.equal((await post('/api/join', { username: 'For Sen' })).status, 409);

  const claim = await (await post('/api/claim', {}, player)).json();
  assert.equal(claim.valid, false);

  const lot = await (await post('/api/admin/lots', { title: 'Perlemix', price: '39', qty: 1, reserveMinutes: 60 }, admin)).json();
  assert.equal((await post(`/api/lots/${lot.id}/ja-tak`, {}, player)).status, 200);
  const snap = await firstEvent('/api/stream', player);
  assert.equal(snap.me.reservations.length, 1);
  assert.equal(snap.lot.qty, 0);
});
