// Kobling til Uniq Perlers Shopify-butik.
//
// 1) Kundekobling via App Proxy: Kunden åbner uniqperler.com/apps/banko mens hun er logget ind.
//    Shopify videresender kaldet til os med `logged_in_customer_id` og en HMAC-signatur.
//    Vi tjekker signaturen og ved dermed sikkert, hvilken kundekonto spilleren hører til.
// 2) "Ja tak"-reservationer: en kladdeordre (draft order) pr. spiller med reserveInventoryUntil,
//    så varerne holdes på lager i X tid, og kunden får et betalingslink til sin samlede banko-kurv.
// 3) Personlige, tidsbegrænsede rabatkoder (én kunde, ét forbrug, udløber automatisk).
//
// Alt herunder er slået fra, indtil SHOPIFY_*-miljøvariablerne er sat (se README).
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificerer en app proxy-forespørgsel efter Shopifys opskrift:
 * fjern `signature`, saml gentagne parametre med komma, sortér "nøgle=værdi" og sæt dem sammen
 * uden skilletegn, og sammenlign med HMAC-SHA256 (hex) af app'ens client secret.
 */
export function verifyAppProxy(searchParams, secret, { maxAgeSeconds = 300, now = Date.now() } = {}) {
  if (!secret) return { valid: false, reason: 'not-configured' };
  const signature = searchParams.get('signature');
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return { valid: false, reason: 'missing-signature' };

  const grouped = new Map();
  for (const [key, value] of searchParams) {
    if (key === 'signature') continue;
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  const message = [...grouped].map(([k, v]) => `${k}=${v.join(',')}`).sort().join('');
  const expected = createHmac('sha256', secret).update(message).digest();
  const given = Buffer.from(signature, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { valid: false, reason: 'bad-signature' };

  const timestamp = Number(searchParams.get('timestamp'));
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > maxAgeSeconds) {
    return { valid: false, reason: 'expired' };
  }
  const customerId = searchParams.get('logged_in_customer_id') || null;
  return { valid: true, customerId: customerId && /^\d+$/.test(customerId) ? customerId : null, shop: searchParams.get('shop') };
}

const toGid = (type, id) => (String(id).startsWith('gid://') ? String(id) : `gid://shopify/${type}/${id}`);

/**
 * Admin API-klient. Brug enten et fast `accessToken` eller — for apps lavet i Shopifys Dev Dashboard —
 * `clientId` + `clientSecret`, så henter klienten selv et token (client credentials grant)
 * og fornyer det, før det udløber (de gælder 24 timer).
 */
export function createShopifyClient({ shop, accessToken, clientId, clientSecret, apiVersion = '2026-10', fetchImpl = fetch }) {
  if (!shop || !(accessToken || (clientId && clientSecret))) return null;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new Error('SHOPIFY_SHOP skal være butikkens *.myshopify.com-domæne');

  let cached = accessToken ? { token: accessToken, expiresAt: Infinity } : null;
  async function getToken() {
    if (cached && cached.expiresAt - 5 * 60_000 > Date.now()) return cached.token;
    const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Kunne ikke hente Shopify-token (${res.status})`);
    const { access_token: token, expires_in: expiresIn } = await res.json();
    cached = { token, expiresAt: Date.now() + Number(expiresIn || 3600) * 1000 };
    return token;
  }

  async function graphql(query, variables) {
    const res = await fetchImpl(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Shopify svarede ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`Shopify-fejl: ${json.errors.map((e) => e.message).join('; ')}`);
    return json.data;
  }

  function assertNoUserErrors(payload) {
    if (payload?.userErrors?.length) throw new Error(payload.userErrors.map((e) => e.message).join('; '));
    return payload;
  }

  return {
    /**
     * Opretter/opdaterer spillerens samlede banko-kurv som kladdeordre og reserverer lageret.
     * `lines` er ALLE spillerens aktive reservationer (draftOrderUpdate erstatter linjerne).
     */
    async upsertReservationDraft({ draftOrderId, customerId, lines, reserveUntil }) {
      const input = {
        lineItems: lines.map((l) => ({
          variantId: toGid('ProductVariant', l.variantId),
          quantity: l.quantity,
          priceOverride: { amount: String(l.price), currencyCode: 'DKK' },
        })),
        purchasingEntity: { customerId: toGid('Customer', customerId) },
        reserveInventoryUntil: new Date(reserveUntil).toISOString(),
        tags: ['banko'],
        note: 'Reserveret under Uniq Perler Banko',
      };
      const fields = 'draftOrder { id invoiceUrl reserveInventoryUntil } userErrors { field message }';
      if (draftOrderId) {
        const data = await graphql(
          `mutation BankoUpdate($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { ${fields} } }`,
          { id: draftOrderId, input },
        );
        return assertNoUserErrors(data.draftOrderUpdate).draftOrder;
      }
      const data = await graphql(
        `mutation BankoCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { ${fields} } }`,
        { input },
      );
      return assertNoUserErrors(data.draftOrderCreate).draftOrder;
    },

    /** Personlig rabatkode: kun denne kunde, kan bruges én gang, udløber automatisk. */
    async createPersonalDiscount({ customerId, code, percentage, endsAt, title }) {
      const data = await graphql(
        `mutation BankoDiscount($input: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $input) {
            codeDiscountNode { id }
            userErrors { field message }
          }
        }`,
        {
          input: {
            title,
            code,
            startsAt: new Date().toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            usageLimit: 1,
            appliesOncePerCustomer: true,
            context: { customers: { add: [toGid('Customer', customerId)] } },
            customerGets: { value: { percentage: percentage / 100 }, items: { all: true } },
          },
        },
      );
      assertNoUserErrors(data.discountCodeBasicCreate);
      return code;
    },
  };
}
