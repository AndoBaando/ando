import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createTokenSigner, RateLimiter, safeEqual } from '../src/auth.js';
import { verifyAppProxy, createShopifyClient } from '../src/shopify.js';

const SECRET = 'x'.repeat(40);

test('tokens: gyldige accepteres, manipulerede og udløbne afvises', () => {
  const signer = createTokenSigner(SECRET);
  const token = signer.sign({ role: 'player', sub: 'abc' }, 60);
  assert.equal(signer.verify(token).sub, 'abc');

  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ role: 'admin', exp: 9999999999 })).toString('base64url');
  assert.equal(signer.verify(`${forged}.${sig}`), null);
  assert.equal(signer.verify(`${body}.${sig.slice(0, -2)}xx`), null);
  assert.equal(createTokenSigner('y'.repeat(40)).verify(token), null);
  assert.equal(signer.verify(signer.sign({ role: 'player' }, -1)), null);
  assert.equal(signer.verify('nonsense'), null);
});

test('safeEqual og rate limiter', () => {
  assert.ok(safeEqual('hemmelig', 'hemmelig'));
  assert.ok(!safeEqual('hemmelig', 'hemmelig2'));
  const limiter = new RateLimiter({ windowMs: 60_000, max: 3 });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.hit('ip')), [true, true, true, false]);
  assert.ok(limiter.hit('anden-ip'));
});

function signProxy(params, secret) {
  const grouped = new Map();
  for (const [k, v] of params) grouped.set(k, [...(grouped.get(k) ?? []), v]);
  const message = [...grouped].map(([k, v]) => `${k}=${v.join(',')}`).sort().join('');
  params.append('signature', createHmac('sha256', secret).update(message).digest('hex'));
  return params;
}

test('app proxy: Shopify-signatur verificeres, og kunde-id kan ikke forfalskes', () => {
  const now = Date.now();
  const params = signProxy(new URLSearchParams({
    shop: 'uniqperler.myshopify.com',
    logged_in_customer_id: '6123456789',
    path_prefix: '/apps/banko',
    timestamp: String(Math.floor(now / 1000)),
  }), 'proxy-secret');
  params.append('extra', '1'); // ekstra parametre efter signering må ikke slippe igennem
  assert.equal(verifyAppProxy(params, 'proxy-secret', { now }).valid, false);
  params.delete('extra');

  const ok = verifyAppProxy(params, 'proxy-secret', { now });
  assert.equal(ok.valid, true);
  assert.equal(ok.customerId, '6123456789');

  const tampered = new URLSearchParams(params);
  tampered.set('logged_in_customer_id', '1');
  assert.equal(verifyAppProxy(tampered, 'proxy-secret', { now }).valid, false);
  assert.equal(verifyAppProxy(params, 'forkert-secret', { now }).valid, false);
  assert.equal(verifyAppProxy(params, 'proxy-secret', { now: now + 3600_000 }).reason, 'expired');
});

test('app proxy: gentagne parametre samles med komma som i Shopifys eksempel', () => {
  const now = Date.now();
  const params = new URLSearchParams([
    ['extra', '1'], ['extra', '2'], ['shop', 'uniqperler.myshopify.com'], ['logged_in_customer_id', ''],
    ['path_prefix', '/apps/banko'], ['timestamp', String(Math.floor(now / 1000))],
  ]);
  signProxy(params, 'hush');
  const result = verifyAppProxy(params, 'hush', { now });
  assert.equal(result.valid, true);
  assert.equal(result.customerId, null); // ikke logget ind
});

test('Shopify-klient: reservation sender reserveInventoryUntil, kunde og live-pris', async () => {
  const calls = [];
  const client = createShopifyClient({
    shop: 'uniqperler.myshopify.com',
    accessToken: 'shpat_test',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      return { ok: true, json: async () => ({ data: { draftOrderCreate: { draftOrder: { id: 'gid://shopify/DraftOrder/1', invoiceUrl: 'https://checkout/1' }, userErrors: [] } } }) };
    },
  });
  const until = Date.now() + 48 * 3600_000;
  const draft = await client.upsertReservationDraft({ customerId: '42', lines: [{ variantId: '777', price: 49.95, quantity: 1 }], reserveUntil: until });
  assert.equal(draft.invoiceUrl, 'https://checkout/1');
  const { url, body, headers } = calls[0];
  assert.match(url, /^https:\/\/uniqperler\.myshopify\.com\/admin\/api\/[\d-]+\/graphql\.json$/);
  assert.equal(headers['X-Shopify-Access-Token'], 'shpat_test');
  assert.match(body.query, /draftOrderCreate/);
  assert.equal(body.variables.input.reserveInventoryUntil, new Date(until).toISOString());
  assert.equal(body.variables.input.purchasingEntity.customerId, 'gid://shopify/Customer/42');
  assert.deepEqual(body.variables.input.lineItems[0], {
    variantId: 'gid://shopify/ProductVariant/777',
    quantity: 1,
    priceOverride: { amount: '49.95', currencyCode: 'DKK' },
  });
});

test('Shopify-klient: fejl fra Shopify kastes videre', async () => {
  const client = createShopifyClient({
    shop: 'uniqperler.myshopify.com',
    accessToken: 'shpat_test',
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: { discountCodeBasicCreate: { userErrors: [{ message: 'Code must be unique' }] } } }) }),
  });
  await assert.rejects(
    client.createPersonalDiscount({ customerId: '42', code: 'BANKO-AAAAAA', percentage: 15, endsAt: Date.now() + 60_000, title: 't' }),
    /must be unique/,
  );
  assert.equal(createShopifyClient({ shop: '', accessToken: '' }), null);
  assert.throws(() => createShopifyClient({ shop: 'evil.com', accessToken: 'x' }), /myshopify/);
});

test('Shopify-klient: Dev Dashboard-app henter selv token og genbruger det', async () => {
  const calls = [];
  const client = createShopifyClient({
    shop: 'uniqperler.myshopify.com',
    clientId: 'cid',
    clientSecret: 'csecret',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/admin/oauth/access_token')) return { ok: true, json: async () => ({ access_token: 'shpat_fra_grant', expires_in: 86399 }) };
      return { ok: true, json: async () => ({ data: { discountCodeBasicCreate: { codeDiscountNode: { id: 'x' }, userErrors: [] } } }) };
    },
  });
  const args = { customerId: '42', code: 'BANKO-AAAAAA', percentage: 15, endsAt: Date.now() + 60_000, title: 't' };
  await client.createPersonalDiscount(args);
  await client.createPersonalDiscount(args);
  const tokenCalls = calls.filter((c) => c.url.endsWith('/admin/oauth/access_token'));
  assert.equal(tokenCalls.length, 1);
  assert.equal(tokenCalls[0].init.body.get('grant_type'), 'client_credentials');
  assert.equal(calls.at(-1).init.headers['X-Shopify-Access-Token'], 'shpat_fra_grant');
});
