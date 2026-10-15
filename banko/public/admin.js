// Admin: styr spillet, se hvem der er tæt på, godkend gevinster, send tilbud og åbn "Ja tak"-lots.
import {
  h, $, fill, api, connectStream, formatKr, formatTime, startCountdowns, tickCountdowns,
  toast, stagePills, board, STAGE_LABELS,
} from './common.js';

const TOKEN_KEY = 'banko.admin';
const session = {
  get() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(value) {
    try { sessionStorage.setItem(TOKEN_KEY, value); } catch { /* ignorér */ }
  },
  clear() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignorér */ }
  },
};

const state = { token: session.get(), snap: null, offset: 0, stream: null, filter: '' };

async function act(path, body, okMessage) {
  try {
    const result = await api(`/api/admin/${path}`, { token: state.token, body });
    if (okMessage) toast(okMessage, 'ok');
    return result;
  } catch (err) {
    toast(err.message, 'bad');
    if (err.status === 401) logout();
    return null;
  }
}

function button(label, onClick, cls = '') {
  const btn = h('button', { class: `btn ${cls}`, type: 'button' }, label);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await onClick();
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

// ------------------------------------------------------------------ forbindelse

function setConn(online) {
  const chip = $('#conn');
  chip.classList.toggle('online', online);
  chip.classList.toggle('offline', !online);
  $('.label', chip).textContent = online ? 'Live' : 'Genopretter…';
}

function connect() {
  $('#login').hidden = true;
  $('#dash').hidden = false;
  $('#logout').hidden = false;
  state.stream?.stop();
  state.stream = connectStream('/api/admin/stream', {
    token: state.token,
    onStatus: setConn,
    onEvent: (event, data) => {
      if (event !== 'state') return;
      state.offset = data.serverTime - Date.now();
      state.snap = data;
      render();
    },
    onAuthError: () => {
      logout();
      toast('Log ind igen.');
    },
  });
}

function logout() {
  state.stream?.stop();
  state.token = null;
  session.clear();
  $('#dash').hidden = true;
  $('#logout').hidden = true;
  $('#login').hidden = false;
  setConn(false);
}

// ------------------------------------------------------------------ visning

function render() {
  const s = state.snap;
  if (!s) return;
  const statusText = { lobby: 'Tilmelding åben', running: 'Spillet kører', finished: 'Spillet er slut' }[s.status];
  $('#status-pill').textContent = statusText;
  $('#status-pill').className = `badge ${s.status === 'running' ? 'm0' : s.status === 'lobby' ? 'm2' : ''}`;
  document.title = `${s.drawn.at(-1) ?? '–'} · Banko Admin`;

  fill($('#stats'),
    h('div', { class: 'stat' }, h('b', null, s.playerCount), h('small', null, 'spillere')),
    h('div', { class: 'stat' }, h('b', null, `${s.drawn.length}/90`), h('small', null, 'tal trukket')),
    h('div', { class: 'stat' }, h('b', null, s.nearlyCount), h('small', null, `mangler 1 til ${s.stageLabel}`)),
  );

  renderControl(s);
  $('#manual-form').hidden = !(s.status === 'running' && s.drawMode === 'manual');
  fill($('#board'), board(s.drawn));
  renderClaims(s);
  renderWinners(s);
  renderPlayers(s);
  renderOffers(s);
  renderLot(s);
  renderReservations(s);
  fill($('#feed'), ...s.feed.slice().reverse().map((f) => h('li', null, h('time', null, formatTime(f.at)), f.text)));
  tickCountdowns(state.offset);
}

function renderControl(s) {
  const parts = [];
  const settingsLine = h('small', { class: 'muted' },
    `${s.platesPerPlayer} ${s.platesPerPlayer === 1 ? 'plade' : 'plader'} pr. spiller · ${s.drawMode === 'digital' ? 'digital trækning' : 'manuel trækning'}`);

  if (s.status === 'lobby') {
    parts.push(
      h('p', { class: 'notice info' }, `Tilmeldingen er åben. ${s.playerCount} ${s.playerCount === 1 ? 'spiller har' : 'spillere har'} hentet plader. Tilmeldingen lukker, når første tal trækkes.`),
      settingsLine,
      button('▶ Start spillet', () => act('game/start', {}, 'Spillet er startet'), 'ok big block'),
    );
  } else if (s.status === 'running') {
    const last = s.drawn.at(-1);
    const stageHasWinner = s.winners.some((w) => w.stage === s.stage);
    parts.push(
      h('div', { class: 'draw-panel' },
        h('div', { class: `ball ${last ? '' : 'empty'}` }, last ?? '–'),
        h('div', { class: 'draw-info' }, h('strong', null, `Nu spilles der om: ${s.stageLabel}`), stagePills(s.stage, s.status), settingsLine)),
    );
    if (s.drawMode === 'digital') {
      parts.push(button(s.drawn.length ? 'Træk næste tal' : 'Træk første tal', () => act('draw', {}), 'big block'));
    } else if (s.drawn.length) {
      parts.push(button(`Fortryd ${last} (tastefejl)`, () => confirm(`Fortryd tallet ${last}?`) && act('undo', {}, 'Tallet er fortrudt'), 'ghost small'));
    }
    const next = s.stage < 3 ? `Videre til ${STAGE_LABELS[s.stage + 1]}` : 'Afslut spillet';
    parts.push(button(stageHasWinner ? `✓ Vinder fundet — ${next}` : next, () => {
      if (!stageHasWinner && !confirm(`Der er ingen godkendt vinder af ${s.stageLabel} endnu. Vil du alligevel gå videre?`)) return null;
      return act('stage/next', {});
    }, stageHasWinner ? 'gold block' : 'secondary block'));
    const auto = h('input', { type: 'checkbox', checked: s.settings.autoApprove });
    auto.addEventListener('change', () => act('settings', { autoApprove: auto.checked }));
    parts.push(h('label', { class: 'check' }, auto, 'Godkend gevinster automatisk'));
  } else {
    parts.push(h('p', { class: 'notice ok' }, `Spillet er slut efter ${s.drawn.length} tal. Start et nyt spil herunder.`));
    if (s.seed) parts.push(h('details', null, h('summary', null, 'Fair-trækning: nøgle til efterregning'), h('p', { class: 'mono mt' }, `Hash: ${s.commitment}`), h('p', { class: 'mono' }, `Seed: ${s.seed}`)));
  }
  fill($('#control'), ...parts);
}

function renderClaims(s) {
  const pending = s.claims.filter((c) => c.status === 'pending' && c.stage === s.stage);
  const unclaimed = s.players.filter((p) => !p.kicked && p.missing === 0 && !p.claimed && !p.wonThisStage);
  $('#claims-count').textContent = pending.length ? `${pending.length} venter` : '';
  const items = [
    ...pending.map((c) =>
      h('div', { class: 'claim' },
        h('div', null, h('strong', null, c.username), h('br'), h('small', null, `${STAGE_LABELS[c.stage]} · plade ${c.plateId} · på tal nr. ${c.drawCount} · ✓ tjekket af serveren`)),
        h('div', { class: 'row' },
          button('Godkend', () => act(`claims/${c.id}/approve`, {}, `${c.username} er godkendt som vinder`), 'ok small'),
          button('Afvis', () => act(`claims/${c.id}/reject`, {}), 'ghost small')))),
    ...unclaimed.map((p) =>
      h('div', { class: 'claim alt' },
        h('div', null, h('strong', null, p.username), h('br'), h('small', null, `Har ${s.stageLabel}, men har ikke trykket BANKO`)),
        button('Godkend', () => act(`players/${p.id}/approve`, {}, `${p.username} er godkendt som vinder`), 'ok small'))),
  ];
  fill($('#claims'), ...(items.length ? items : [h('p', { class: 'muted' }, s.status === 'running' ? 'Ingen BANKO-råb lige nu.' : 'Råb dukker op her, når spillet kører.')]));
}

function renderWinners(s) {
  if (!s.winners.length) return fill($('#winners'), h('p', { class: 'muted' }, 'Ingen vindere endnu.'));
  const linked = new Map(s.players.map((p) => [p.username, p.linked]));
  fill($('#winners'),
    h('ul', { class: 'list' }, s.winners.map((w) =>
      h('li', null,
        h('div', null, h('strong', null, w.username), linked.get(w.username) ? ' 🔗' : '', h('br'), h('small', null, `${STAGE_LABELS[w.stage]} · tal nr. ${w.drawCount} · ${formatTime(w.at)}`)),
        h('span', { class: 'badge won' }, STAGE_LABELS[w.stage])))),
  );
}

function renderPlayers(s) {
  const filter = state.filter.trim().toLocaleLowerCase('da-DK');
  const rows = s.players.filter((p) => !filter || p.username.toLocaleLowerCase('da-DK').includes(filter));
  const shown = rows.slice(0, 200);
  const missingBadge = (p) => {
    if (p.wonThisStage) return h('span', { class: 'badge won' }, 'Vundet');
    if (s.status === 'lobby' || !s.drawn.length) return h('span', { class: 'badge' }, '–');
    return h('span', { class: `badge ${p.missing <= 2 ? `m${p.missing}` : ''}` }, p.missing === 0 ? 'GEVINST' : p.missing);
  };
  fill($('#players'),
    h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Spiller'), h('th', null, 'Mangler'), h('th', { title: 'Fulde rækker' }, 'Rækker'), h('th', { title: 'Forkerte BANKO-råb' }, 'Falske'), h('th', null, ''))),
      h('tbody', null, shown.map((p) =>
        h('tr', { class: p.kicked ? 'kicked' : '' },
          h('td', null, p.bot ? '🤖 ' : '', h('strong', null, p.username), p.linked ? ' 🔗' : '', p.wins.length ? ` 🏆×${p.wins.length}` : ''),
          h('td', null, missingBadge(p)),
          h('td', null, p.fullRows),
          h('td', null, p.falseClaims || ''),
          h('td', null, h('div', { class: 'row' },
            p.kicked ? null : button('Omdøb', async () => {
              const name = prompt(`Nyt navn til ${p.username}:`, p.username);
              if (name && name !== p.username) await act(`players/${p.id}/rename`, { username: name }, 'Navnet er ændret');
            }, 'ghost small'),
            p.kicked ? null : button('Fjern', async () => {
              if (confirm(`Fjern ${p.username} fra spillet?`)) await act(`players/${p.id}/kick`, {}, `${p.username} er fjernet`);
            }, 'ghost small'))))))),
    rows.length > shown.length ? h('p', { class: 'muted mt' }, `Viser de ${shown.length} tætteste af ${rows.length} spillere.`) : null,
    rows.length ? null : h('p', { class: 'muted mt' }, 'Ingen spillere endnu.'),
  );
}

function renderOffers(s) {
  const now = Date.now() + state.offset;
  const active = s.allOffers.filter((o) => !o.ended && o.expiresAt > now);
  fill($('#offers'),
    active.length
      ? h('ul', { class: 'list' }, active.map((o) =>
        h('li', null,
          h('div', null, h('strong', null, o.title), h('br'),
            h('small', null, o.personal ? `Personlig kode ${o.discountPercent}% · ` : '', 'udløber om ', h('span', { class: 'countdown', dataset: { expires: o.expiresAt } }))),
          button('Stop', () => act(`offers/${o.id}/end`, {}, 'Tilbuddet er stoppet'), 'ghost small'))))
      : h('p', { class: 'muted' }, 'Ingen aktive tilbud.'),
  );
}

function renderLot(s) {
  const lot = s.lots.find((l) => l.status === 'open');
  if (!lot) return fill($('#lot-status'), h('p', { class: 'muted' }, 'Intet åbent lot. Åbn et herunder, når I viser varen på kameraet.'));
  const reservations = s.reservations.filter((r) => r.lotId === lot.id && r.status === 'active');
  fill($('#lot-status'),
    h('div', { class: 'product' },
      lot.imageUrl ? h('img', { src: lot.imageUrl, alt: '', referrerpolicy: 'no-referrer' }) : h('div', { class: 'ph' }, '🛍️'),
      h('div', null, h('h3', null, lot.title), h('div', { class: 'price' }, formatKr(lot.price)), h('small', null, `${lot.qty} af ${lot.initialQty} tilbage · ${reservations.length} reserveret`))),
    reservations.length ? h('small', null, `Ja tak fra: ${reservations.map((r) => r.username).join(', ')}`) : null,
    button('Luk lot', () => act(`lots/${lot.id}/close`, {}, 'Lottet er lukket'), 'secondary block'),
  );
}

function renderReservations(s) {
  if (!s.reservations.length) return fill($('#reservations'), h('p', { class: 'muted' }, 'Ingen reservationer endnu.'));
  const statusText = (r) => {
    if (r.status === 'expired') return 'Udløbet';
    if (r.syncError) return '⚠️ Shopify-fejl';
    if (r.checkoutUrl) return '✓ I kurv';
    return r.variantId ? 'Synkroniserer…' : 'Reserveret';
  };
  fill($('#reservations'),
    h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Spiller'), h('th', null, 'Vare'), h('th', null, 'Status'), h('th', null, 'Udløber'))),
      h('tbody', null, s.reservations.slice().reverse().map((r) =>
        h('tr', { class: r.status === 'active' ? '' : 'kicked' },
          h('td', null, r.username),
          h('td', { class: 'wrap-cell' }, r.title, h('br'), h('small', null, formatKr(r.price))),
          h('td', null, statusText(r)),
          h('td', null, r.status === 'active' ? h('span', { class: 'countdown', dataset: { expires: r.expiresAt } }) : '–'))))));
}

// ------------------------------------------------------------------ formularer

function formData(form) {
  const data = Object.fromEntries(new FormData(form));
  for (const el of form.querySelectorAll('input[type=checkbox]')) data[el.name] = el.checked;
  return data;
}

function bind() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { token } = await api('/api/admin/login', { body: { password: $('#password').value } });
      state.token = token;
      session.set(token);
      $('#password').value = '';
      connect();
    } catch (err) {
      toast(err.message, 'bad');
    }
  });
  $('#logout').addEventListener('click', logout);

  $('#manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#manual-number');
    const res = await act('draw', { number: input.value });
    if (res) input.value = '';
    input.focus();
  });

  $('#new-game-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('Start et helt nyt spil? Alle spillere skal hente nye plader.')) return;
    await act('game/new', formData(e.target), 'Nyt spil er klar — tilmeldingen er åben');
  });

  $('#bots-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await act('bots', formData(e.target));
    if (res) toast(`${res.added} testspillere tilføjet`, 'ok');
  });

  $('#offer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    data.durationSec = Number(data.durationMin) * 60;
    if (await act('offers', data, 'Tilbuddet er sendt til alle spillere')) e.target.reset();
  });

  $('#lot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    data.reserveMinutes = Number(data.reserveHours) * 60;
    if (await act('lots', data, 'Lottet er åbent — "Ja tak" er slået til')) {
      e.target.reset();
      e.target.closest('details').open = false;
    }
  });

  $('#player-filter').addEventListener('input', (e) => {
    state.filter = e.target.value;
    if (state.snap) renderPlayers(state.snap);
  });
}

bind();
startCountdowns(() => state.offset);
if (state.token) connect();
else logout();
