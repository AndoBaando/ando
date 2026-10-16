// Kundevisningen: tilmelding, plader, BANKO-knap, live-tilbud og banko-kurv.
import {
  h, $, fill, api, connectStream, formatKr, formatTime, startCountdowns, tickCountdowns,
  toast, stagePills, board, storage, STAGE_LABELS,
} from './common.js';

const STAGE_ROWS = { 1: 1, 2: 2, 3: 3 };
// Køb må aldrig påvirke spillet — ellers kan købet tælle som en indsats efter spilleloven.
const FREE_NOTE = 'Køb er frivilligt og påvirker ikke dine chancer i banko.';

const session = {
  get(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, value); } catch { /* ignorér */ }
  },
  remove(key) {
    try { sessionStorage.removeItem(key); } catch { /* ignorér */ }
  },
};

const state = {
  token: storage.get('banko.token'),
  link: null,
  config: {},
  snap: null,
  offset: 0,
  stream: null,
  marks: storage.get('banko.marks', {}),
  prefs: { autoMark: true, speak: false, bigText: false, ...storage.get('banko.prefs', {}) },
  dismissed: new Set(storage.get('banko.dismissedOffers', [])),
  openOfferId: null,
  openDetails: new Set(),
};

/** <details> der husker om de er foldet ud, selvom siden tegnes om ved hvert nyt tal. */
function details(key, summary, ...content) {
  const el = h('details', { class: 'mt', open: state.openDetails.has(key) }, h('summary', null, summary), ...content);
  el.addEventListener('toggle', () => (el.open ? state.openDetails.add(key) : state.openDetails.delete(key)));
  return el;
}

// ------------------------------------------------------------------ pladeberegning (spejler serveren)

function missingForStage(rows, drawnSet, stage) {
  return rows
    .map((row) => row.filter((n) => n !== null && !drawnSet.has(n)).length)
    .sort((a, b) => a - b)
    .slice(0, STAGE_ROWS[stage])
    .reduce((sum, x) => sum + x, 0);
}

// ------------------------------------------------------------------ opstart

async function init() {
  applyPrefs();
  bindStatic();
  const params = new URLSearchParams(location.search);
  if (params.has('link')) {
    session.set('banko.link', params.get('link'));
    history.replaceState(null, '', location.pathname);
  }
  state.link = session.get('banko.link');
  state.config = await api('/api/config', { method: 'GET' }).catch(() => ({}));
  startCountdowns(() => state.offset);
  if (state.token) connectPlayer();
  else showJoin();
}

function setConn(online) {
  const chip = $('#conn');
  chip.classList.toggle('online', online);
  chip.classList.toggle('offline', !online);
  $('.label', chip).textContent = online ? 'Live' : 'Genopretter…';
}

async function showJoin() {
  $('#join').hidden = false;
  connectPublic();
  const status = $('#link-status');
  status.replaceChildren();
  if (state.link) {
    const peek = await api('/api/link/peek', { body: { linkToken: state.link } }).catch(() => ({ linked: false }));
    if (peek.linked) {
      status.append(h('p', { class: 'notice ok' }, '✓ Du er logget ind med din Uniq Perler-konto. Så kan vi give dig personlige tilbud og reservere varer direkte til dig.'));
      if (peek.suggestedUsername && !$('#username').value) $('#username').value = peek.suggestedUsername;
    } else {
      state.link = null;
      session.remove('banko.link');
    }
  }
  if (!state.link && state.config.shopifyLinking) {
    status.append(
      h('p', { class: 'notice info' },
        'Har du en kundekonto hos os? ',
        h('a', { href: state.config.shopLoginUrl }, 'Log ind via webshoppen'),
        ' og spil med din konto — så får du personlige tilbud og kan lægge live-tilbud direkte i kurven.'),
    );
  }
  updateJoinAvailability();
}

function updateJoinAvailability() {
  const s = state.snap;
  const loginRequired = state.config.requireShopifyLogin && !state.link;
  const open = s ? s.joinOpen : true;
  $('#join-form').hidden = !open || loginRequired;
  $('#join-closed').hidden = open;
}

function connectPublic() {
  state.stream?.stop();
  state.stream = connectStream('/api/stream/public', {
    onStatus: setConn,
    onEvent: (event, data) => event === 'state' && onState(data),
  });
}

function connectPlayer() {
  state.stream?.stop();
  state.stream = connectStream('/api/stream', {
    token: state.token,
    onStatus: setConn,
    onEvent: (event, data) => {
      if (event === 'rejoin') resetToJoin('Et nyt spil er startet — hent dine nye plader.');
      else if (event === 'state') onState(data);
    },
    onAuthError: (err) => resetToJoin(err.status === 403 ? err.error : err.code === 'rejoin' ? 'Et nyt spil er startet — hent dine nye plader.' : null),
  });
}

function resetToJoin(message) {
  state.stream?.stop();
  state.token = null;
  state.snap = null;
  storage.remove('banko.token');
  $('#claim-bar').hidden = true;
  if (message) toast(message);
  showJoin();
}

// ------------------------------------------------------------------ live-tilstand

function onState(snap) {
  if (!snap.me) snap.me = null;
  state.offset = snap.serverTime - Date.now();
  const prev = state.snap;
  state.snap = snap;
  const sameGame = prev && prev.gameId === snap.gameId;
  const newNumber = sameGame && snap.drawn.length > prev.drawn.length ? snap.drawn.at(-1) : null;

  if (sameGame && snap.winners.length > prev.winners.length) {
    for (const w of snap.winners.slice(prev.winners.length)) {
      const isMe = snap.me && w.username === snap.me.username;
      toast(isMe ? `🎉 DU har vundet ${STAGE_LABELS[w.stage]}! Vi kontakter dig om præmien.` : `🏆 ${w.username} vinder ${STAGE_LABELS[w.stage]}!`, 'win');
      if (isMe) confetti();
    }
  }
  if (newNumber && state.prefs.speak) speak(String(newNumber));
  if (!snap.me) updateJoinAvailability();
  render(newNumber);
  syncOfferModal();
}

function render(newNumber) {
  const s = state.snap;
  if (!s) return;
  const me = s.me;
  const drawnSet = new Set(s.drawn);
  $('#players-chip').hidden = false;
  $('#players-chip').textContent = `👥 ${s.playerCount}`;
  $('#game').hidden = false;
  $('#settings').hidden = !me;

  fill($('#game'),
    drawCard(s, newNumber),
    s.lot ? lotCard(s, me) : null,
    me ? platesSection(s, me, drawnSet, newNumber) : null,
    s.offers.length ? offersCard(s) : null,
    me?.reservations.length ? cartCard(me) : null,
    feedCard(s),
    fairCard(s),
  );
  renderClaimBar(s, me, drawnSet);
  tickCountdowns(state.offset);
}

function drawCard(s, newNumber) {
  const last = s.drawn.at(-1);
  const statusText =
    s.status === 'lobby' ? 'Spillet starter snart — gør dig klar!'
      : s.status === 'finished' ? 'Spillet er slut. Tak for i aften! 💛'
        : s.drawn.length ? `Tal nr. ${s.drawn.length} af 90` : 'Første tal trækkes om lidt…';
  return h('section', { class: 'card' },
    h('div', { class: 'draw-panel' },
      h('div', { class: `ball ${last ? '' : 'empty'} ${newNumber ? 'pop' : ''}`, role: 'status', 'aria-live': 'polite', 'aria-label': last ? `Sidste tal: ${last}` : 'Ingen tal endnu' }, last ?? 'Klar?'),
      h('div', { class: 'draw-info' },
        h('strong', null, statusText),
        s.drawn.length > 1 ? h('div', { class: 'recent', 'aria-label': 'Seneste tal' }, s.drawn.slice(-6, -1).reverse().map((n) => h('span', { class: 'ball small' }, n))) : null,
        stagePills(s.stage, s.status))),
    s.nearlyCount > 0
      ? h('p', { class: 'nearly mt' }, `🔥 ${s.nearlyCount} ${s.nearlyCount === 1 ? 'spiller mangler' : 'spillere mangler'} kun 1 tal til ${s.stageLabel}!`)
      : null,
    s.drawn.length ? details('board', 'Se alle trukne tal', h('div', { class: 'mt' }, board(s.drawn))) : null,
  );
}

function platesSection(s, me, drawnSet, newNumber) {
  if (me.kicked) return h('p', { class: 'notice danger' }, 'Du er blevet fjernet fra dette spil.');
  return h('section', { class: 'stack' },
    h('div', { class: 'card-head' },
      h('h2', null, `Dine plader, ${me.username}`),
      me.linked ? h('small', null, '🔗 Koblet til din kundekonto') : null),
    h('div', { class: 'plates' }, me.plates.map((plate, i) => renderPlate(s, plate, i, drawnSet, newNumber))));
}

function manualMarks(gameId, plateId) {
  return new Set(state.marks[gameId]?.[plateId] ?? []);
}

function toggleMark(gameId, plateId, n) {
  const marks = manualMarks(gameId, plateId);
  if (marks.has(n)) marks.delete(n);
  else marks.add(n);
  state.marks = { [gameId]: { ...(state.marks[gameId] ?? {}), [plateId]: [...marks] } };
  storage.set('banko.marks', state.marks);
  render(null);
}

function renderPlate(s, plate, index, drawnSet, newNumber) {
  const manual = !state.prefs.autoMark;
  const marks = manualMarks(s.gameId, plate.id);
  const missing = missingForStage(plate.rows, drawnSet, s.stage);
  const label =
    manual || s.status !== 'running' ? ''
      : missing === 0 ? `✓ Gevinst på ${s.stageLabel}!` : `Mangler ${missing} til ${s.stageLabel}`;

  const rows = plate.rows.map((row) => {
    const full = row.every((n) => n === null || drawnSet.has(n));
    return h('div', { class: `plate-row ${full && !manual ? 'done' : ''}` },
      row.map((n) => {
        if (n === null) return h('div', { class: 'cell empty', 'aria-hidden': 'true' });
        const marked = manual ? marks.has(n) : drawnSet.has(n);
        const cls = `cell ${marked ? 'marked' : ''} ${!manual && n === newNumber ? 'fresh' : ''}`;
        if (manual) {
          return h('button', { class: cls, type: 'button', 'aria-pressed': String(marked), onclick: () => toggleMark(s.gameId, plate.id, n) }, h('span', null, n));
        }
        return h('div', { class: cls }, h('span', null, n));
      }));
  });
  return h('article', { class: 'plate', 'aria-label': `Plade ${index + 1}` },
    h('div', { class: 'plate-head' }, h('span', null, `Plade ${index + 1}`), h('span', { class: `missing ${missing === 0 ? 'win' : ''}` }, label)),
    h('div', { class: 'plate-rows' }, rows));
}

function renderClaimBar(s, me, drawnSet) {
  const bar = $('#claim-bar');
  const btn = $('#banko');
  bar.hidden = !me || me.kicked || s.status !== 'running';
  if (bar.hidden) return;
  const won = me.wins.includes(s.stage);
  const hasWin = me.plates.some((p) => missingForStage(p.rows, drawnSet, s.stage) === 0);
  btn.disabled = s.drawn.length === 0 || won || me.claimPending;
  btn.textContent = won ? `Du har vundet ${s.stageLabel}! 🎉` : me.claimPending ? 'Vi tjekker din plade…' : 'BANKO!';
  btn.classList.toggle('ready', hasWin && !won && !me.claimPending && state.prefs.autoMark);
}

const productImage = (url, emoji) => (url ? h('img', { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'ph', 'aria-hidden': 'true' }, emoji));
const hoursText = (min) => (min >= 120 ? `${Math.round(min / 60)} timer` : min >= 60 ? '1 time' : `${min} min`);

function lotCard(s, me) {
  const lot = s.lot;
  const mine = me ? me.reservations.filter((r) => r.lotId === lot.id && r.status === 'active').length : 0;
  const soldOut = lot.qty <= 0;
  const stock = h('span');
  stock.style.width = `${Math.round((lot.qty / lot.initialQty) * 100)}%`;
  let action;
  if (!me) action = h('p', { class: 'muted' }, 'Tilmeld dig spillet for at sige Ja tak.');
  else if (mine >= lot.maxPerPlayer) action = h('p', { class: 'notice ok' }, '✓ Reserveret til dig — den ligger i din banko-kurv.');
  else action = h('button', { class: 'btn gold block big', type: 'button', disabled: soldOut, onclick: (e) => jaTak(lot.id, e.currentTarget) }, soldOut ? 'Udsolgt' : 'Ja tak! 🙋');

  return h('section', { class: 'card lot-card' },
    h('div', { class: 'card-head' }, h('span', { class: 'lot-badge' }, 'LIVE-TILBUD'), h('small', null, `Holdes til dig i ${hoursText(lot.reserveMinutes)}`)),
    h('div', { class: 'product' },
      productImage(lot.imageUrl, '🛍️'),
      h('div', null,
        h('h3', null, lot.title),
        h('div', { class: 'price' }, formatKr(lot.price), lot.compareAt ? h('s', null, formatKr(lot.compareAt)) : null),
        h('div', { class: 'stock', 'aria-hidden': 'true' }, stock),
        h('small', null, soldOut ? 'Alle er reserveret' : `${lot.qty} af ${lot.initialQty} tilbage`))),
    h('div', { class: 'mt' }, action),
    h('small', { class: 'muted' }, FREE_NOTE));
}

async function jaTak(lotId, btn) {
  btn.disabled = true;
  try {
    await api(`/api/lots/${lotId}/ja-tak`, { token: state.token });
    toast('Ja tak! Varen er reserveret til dig 🛍️', 'ok');
  } catch (err) {
    toast(err.message, 'bad');
    btn.disabled = false;
  }
}

function offersCard(s) {
  return h('section', { class: 'card' },
    h('h2', null, '⏰ Tilbud lige nu'),
    h('ul', { class: 'list' }, s.offers.map((o) =>
      h('li', null,
        h('div', null, h('strong', null, o.title), h('br'), h('small', null, 'Udløber om ', h('span', { class: 'countdown', dataset: { expires: o.expiresAt } }))),
        h('button', { class: 'btn small', type: 'button', onclick: () => openOffer(o) }, 'Vis')))));
}

function cartCard(me) {
  const active = me.reservations.filter((r) => r.status === 'active');
  const total = active.reduce((sum, r) => sum + r.price, 0);
  const checkoutUrl = active.find((r) => r.checkoutUrl)?.checkoutUrl;
  let footer = null;
  if (active.length && checkoutUrl) {
    footer = h('a', { class: 'btn block big mt', href: checkoutUrl, target: '_blank', rel: 'noopener' }, 'Gå til betaling');
  } else if (active.length) {
    let text = 'Vi gør din kurv klar i webshoppen…';
    if (state.config.demo) text = 'Demo: I den rigtige version ligger varerne klar i din kurv i webshoppen, og du kan samle dem med dine andre ordrer (Samle Ordre).';
    else if (!me.linked) text = 'Dine varer er reserveret. Vi kontakter dig om betaling — eller log ind med din kundekonto næste gang, så ligger de direkte i din kurv.';
    footer = h('p', { class: 'muted mt' }, text);
  }
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, '🛍️ Din banko-kurv'), h('strong', null, formatKr(total))),
    h('ul', { class: 'list' }, me.reservations.slice().reverse().map((r) =>
      h('li', { class: r.status === 'active' ? '' : 'expired' },
        h('div', null,
          h('strong', null, r.title), h('br'),
          h('small', null, r.status === 'active' ? ['Reserveret i ', h('span', { class: 'countdown', dataset: { expires: r.expiresAt } })] : 'Reservationen er udløbet')),
        h('span', { class: 'price' }, formatKr(r.price))))),
    footer);
}

function feedCard(s) {
  const winners = [1, 2, 3].map((stage) => [stage, s.winners.filter((w) => w.stage === stage).map((w) => w.username)]).filter(([, names]) => names.length);
  if (!winners.length && !s.feed.length) return null;
  return h('section', { class: 'card' },
    h('h2', null, 'Det sker i aften'),
    winners.length
      ? h('ul', { class: 'list' }, winners.map(([stage, names]) => h('li', null, h('strong', null, `🏆 ${STAGE_LABELS[stage]}`), h('span', null, names.join(', ')))))
      : null,
    h('ul', { class: 'feed mt' }, s.feed.slice().reverse().slice(0, 8).map((f) => h('li', null, h('time', null, formatTime(f.at)), f.text))));
}

function fairCard(s) {
  const body = s.drawMode === 'manual'
    ? [h('p', null, 'I aften trækker vi tallene fysisk og live på kameraet. Tallene bliver tastet ind med det samme, og din plade tjekkes automatisk på vores server, når du råber BANKO.')]
    : [
      h('p', null, 'Rækkefølgen af alle 90 tal blev låst, før spillet startede. Her er fingeraftrykket (SHA-256), som ikke kan ændres bagefter:'),
      h('p', { class: 'mono' }, s.commitment),
      s.seed
        ? [h('p', null, 'Spillet er slut, så her er nøglen. Med den kan alle efterregne, at tallene kom i præcis den låste rækkefølge:'), h('p', { class: 'mono' }, s.seed)]
        : h('p', { class: 'muted' }, 'Nøglen vises her, når spillet er slut.'),
    ];
  return h('section', { class: 'card fair' }, details('fair', '🔒 Fair trækning — sådan sikrer vi det', h('div', { class: 'mt' }, body)));
}

// ------------------------------------------------------------------ tilbud (pop-up)

function syncOfferModal() {
  const offers = state.snap?.offers ?? [];
  if (state.openOfferId && !offers.some((o) => o.id === state.openOfferId)) closeOfferModal();
  if (state.openOfferId) return;
  const next = offers.find((o) => !state.dismissed.has(o.id));
  if (next) openOffer(next);
}

function closeOfferModal(dismiss = false) {
  if (dismiss && state.openOfferId) {
    state.dismissed.add(state.openOfferId);
    storage.set('banko.dismissedOffers', [...state.dismissed].slice(-50));
  }
  state.openOfferId = null;
  fill($('#modal-root'));
}

function codeBlock(code, demo) {
  return h('div', { class: 'stack' },
    h('div', { class: 'code' }, code),
    h('button', {
      class: 'btn secondary block',
      type: 'button',
      onclick: () => navigator.clipboard?.writeText(code).then(() => toast('Koden er kopieret ✓', 'ok'), () => toast('Kunne ikke kopiere — markér koden og kopiér selv.')),
    }, 'Kopiér kode'),
    h('small', { class: 'muted' }, 'Koden virker kun for dig og udløber sammen med tilbuddet.'),
    demo ? h('small', { class: 'muted' }, 'Demo: koden er ikke oprettet i Shopify.') : null);
}

function openOffer(offer) {
  const me = state.snap?.me;
  state.openOfferId = offer.id;
  const actions = h('div', { class: 'stack' });
  if (offer.personal) {
    const code = me?.personalCodes?.[offer.id];
    if (!me) actions.append(h('p', { class: 'muted' }, 'Tilmeld dig spillet for at få din personlige kode.'));
    else if (code) actions.append(codeBlock(code, state.config.demo));
    else {
      const btn = h('button', {
        class: 'btn block big',
        type: 'button',
        onclick: async () => {
          btn.disabled = true;
          try {
            const res = await api(`/api/offers/${offer.id}/activate`, { token: state.token });
            btn.replaceWith(codeBlock(res.code, res.demo));
          } catch (err) {
            toast(err.message, 'bad');
            btn.disabled = false;
          }
        },
      }, `Hent min rabatkode — ${offer.discountPercent}% rabat`);
      actions.append(btn);
    }
  }
  if (offer.url) actions.append(h('a', { class: `btn ${offer.personal ? 'secondary' : ''} block big`, href: offer.url, target: '_blank', rel: 'noopener' }, 'Se tilbuddet i webshoppen'));
  actions.append(h('button', { class: 'btn ghost block', type: 'button', onclick: () => closeOfferModal(true) }, 'Luk'));
  actions.append(h('small', { class: 'muted' }, FREE_NOTE));

  const modal = h('div', { class: 'modal-backdrop', onclick: (e) => e.target === e.currentTarget && closeOfferModal(true) },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'offer-title' },
      h('div', null, h('span', { class: 'lot-badge' }, offer.personal ? 'KUN TIL DIG' : 'TIDSBEGRÆNSET TILBUD')),
      offer.imageUrl ? h('img', { src: offer.imageUrl, alt: '', referrerpolicy: 'no-referrer' }) : null,
      h('h2', { id: 'offer-title' }, offer.title),
      offer.text ? h('p', null, offer.text) : null,
      offer.price !== null ? h('div', { class: 'price' }, formatKr(offer.price), offer.compareAt ? h('s', null, formatKr(offer.compareAt)) : null) : null,
      h('p', { class: 'timer' }, '⏰ Udløber om ', h('span', { class: 'countdown', dataset: { expires: offer.expiresAt } })),
      actions));
  fill($('#modal-root'), modal);
  tickCountdowns(state.offset);
}

// ------------------------------------------------------------------ små fornøjelser

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'da-DK';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* tale understøttes ikke */
  }
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f6b93b', '#d81b60', '#6b2fa0', '#4fc3f7', '#43a047', '#ff7043'];
  for (let i = 0; i < 90; i++) {
    const el = h('span', { class: 'confetti', 'aria-hidden': 'true' });
    const size = `${6 + Math.random() * 8}px`;
    Object.assign(el.style, {
      left: `${Math.random() * 100}vw`,
      width: size,
      height: size,
      background: colors[i % colors.length],
      animationDuration: `${2.5 + Math.random() * 2}s`,
      animationDelay: `${Math.random() * 0.6}s`,
    });
    document.body.append(el);
    setTimeout(() => el.remove(), 5500);
  }
}

// ------------------------------------------------------------------ indstillinger + knapper

function applyPrefs() {
  document.body.classList.toggle('big-text', state.prefs.bigText);
  $('#pref-auto').checked = state.prefs.autoMark;
  $('#pref-speak').checked = state.prefs.speak;
  $('#pref-big').checked = state.prefs.bigText;
}

function bindStatic() {
  const savePrefs = () => {
    storage.set('banko.prefs', state.prefs);
    applyPrefs();
    render(null);
  };
  $('#pref-auto').addEventListener('change', (e) => { state.prefs.autoMark = e.target.checked; savePrefs(); });
  $('#pref-speak').addEventListener('change', (e) => {
    state.prefs.speak = e.target.checked;
    if (state.prefs.speak) speak('Oplæsning er slået til');
    savePrefs();
  });
  $('#pref-big').addEventListener('change', (e) => { state.prefs.bigText = e.target.checked; savePrefs(); });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && state.openOfferId && closeOfferModal(true));

  $('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target);
    const error = $('#join-error');
    btn.disabled = true;
    error.hidden = true;
    try {
      const { token } = await api('/api/join', { body: { username: $('#username').value, linkToken: state.link } });
      state.token = token;
      storage.set('banko.token', token);
      if (state.link) {
        session.remove('banko.link');
        state.link = null;
      }
      $('#join').hidden = true;
      connectPlayer();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('#banko').addEventListener('click', async () => {
    const btn = $('#banko');
    btn.disabled = true;
    try {
      const res = await api('/api/claim', { token: state.token });
      if (res.valid) toast(res.approved ? 'BANKO! Din gevinst er godkendt 🎉' : 'BANKO! Vi tjekker din plade lige nu…', 'ok');
      else toast(`Øv, ikke helt endnu — du mangler ${res.missing} tal. Efter 3 forkerte BANKO-råb kan du ikke råbe mere i dette spil.`, 'bad');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      if (state.snap?.me) renderClaimBar(state.snap, state.snap.me, new Set(state.snap.drawn));
    }
  });
}

init();
