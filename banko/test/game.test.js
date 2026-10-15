import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GameError } from '../src/game.js';
import { missingForStage } from '../src/plates.js';

function drawUntilSomeoneWins(game) {
  while (game.drawn.length < 90) {
    game.draw();
    const winner = [...game.players.values()].find((p) => game.bestForPlayer(p).missing === 0);
    if (winner) return winner;
  }
  throw new Error('ingen vinder');
}

test('tilmelding: navne valideres og skal være unikke', () => {
  const game = new Game();
  game.join({ username: 'Perle-Lise' });
  assert.throws(() => game.join({ username: 'perle lise' }), /allerede taget/);
  assert.throws(() => game.join({ username: 'ab' }), /mindst 3/);
  assert.throws(() => game.join({ username: '<script>' }), /Brug kun/);
  assert.throws(() => game.join({ username: 'UniqPerler' }), /kan desværre ikke/);
});

test('samme Shopify-kunde får altid den samme spiller (ingen ekstra plader)', () => {
  const game = new Game();
  const a = game.join({ username: 'Mette', customerId: '123' });
  const b = game.join({ username: 'Mette2', customerId: '123' });
  assert.equal(a.id, b.id);
  assert.equal(game.players.size, 1);
});

test('tilmeldingen lukker når første tal er trukket', () => {
  const game = new Game();
  game.join({ username: 'Tidlig' });
  game.start();
  game.draw();
  assert.throws(() => game.join({ username: 'Sen' }), /lukket/);
});

test('falsk BANKO afvises og tælles — gyldigt BANKO godkendes', () => {
  const game = new Game({ platesPerPlayer: 1 });
  game.addBots(30);
  game.start();
  game.draw();
  const someone = [...game.players.values()][0];
  const res = game.claim(someone.id);
  assert.equal(res.valid, false);
  assert.equal(someone.falseClaims, 1);

  const winner = drawUntilSomeoneWins(game);
  const claim = game.claim(winner.id);
  assert.equal(claim.valid, true);
  game.approveClaim(claim.claim.id);
  assert.equal(game.winners.length, 1);
  assert.equal(game.winners[0].playerId, winner.id);
  assert.throws(() => game.claim(winner.id), /allerede vundet/);
});

test('for mange forkerte råb blokerer spilleren', () => {
  const game = new Game({ platesPerPlayer: 1 });
  const p = game.join({ username: 'Utålmodig' });
  game.start();
  game.draw();
  for (let i = 0; i < 3; i++) game.claim(p.id);
  assert.throws(() => game.claim(p.id), (err) => err instanceof GameError && err.status === 429);
});

test('hele spillet: 1 række → 2 rækker → fuld plade, og seed afsløres til sidst', () => {
  const game = new Game({ platesPerPlayer: 2, autoApprove: true });
  game.addBots(40);
  game.start();
  for (const stage of [1, 2, 3]) {
    assert.equal(game.stage, stage);
    while (!game.winners.some((w) => w.stage === stage)) game.draw();
    for (const w of game.winners.filter((x) => x.stage === stage)) {
      const plate = game.players.get(w.playerId).plates.find((p) => p.id === w.plateId);
      assert.equal(missingForStage(plate.rows, new Set(game.drawn), stage), 0);
    }
    game.nextStage();
  }
  assert.equal(game.status, 'finished');
  assert.ok(game.publicSnapshot().seed);
});

test('spillere ser kun deres egne plader, og seed er hemmeligt mens spillet kører', () => {
  const game = new Game();
  const a = game.join({ username: 'Anna' });
  const b = game.join({ username: 'Bente' });
  game.start();
  const snap = JSON.stringify(game.playerSnapshot(a.id));
  for (const plate of b.plates) assert.ok(!snap.includes(plate.id));
  assert.ok(!snap.includes(game.seed));
  assert.ok(!JSON.stringify(game.adminSnapshot()).includes(game.seed));
  assert.ok(!JSON.stringify(game.publicSnapshot()).includes('"plates":'));
});

test('manuel trækning: kun gyldige tal, ingen dubletter, fortryd ved tastefejl', () => {
  const game = new Game({ drawMode: 'manual' });
  game.start();
  assert.throws(() => game.draw(91), /mellem 1 og 90/);
  game.draw(42);
  assert.throws(() => game.draw('42'), /allerede trukket/);
  assert.equal(game.undo(), 42);
  assert.deepEqual(game.drawn, []);
  const digital = new Game();
  digital.start();
  digital.draw();
  assert.throws(() => digital.undo(), /kan ikke fortrydes/);
});

test('Ja tak: lager tælles ned, maks pr. kunde, og udløbne reservationer frigives', () => {
  const game = new Game();
  const a = game.join({ username: 'Anna' });
  const b = game.join({ username: 'Bente' });
  const c = game.join({ username: 'Cille' });
  const lot = game.openLot({ title: 'Perlemix', price: '49,95', qty: 2, reserveMinutes: 60 });
  assert.equal(lot.price, 49.95);
  const now = Date.now();
  game.reserve(a.id, lot.id, now);
  assert.throws(() => game.reserve(a.id, lot.id, now), /allerede reserveret/);
  game.reserve(b.id, lot.id, now);
  assert.throws(() => game.reserve(c.id, lot.id, now), /Udsolgt/);
  game.expireReservations(now + 61 * 60_000);
  assert.equal(lot.qty, 2);
  game.reserve(c.id, lot.id, now + 62 * 60_000);
  assert.equal(lot.qty, 1);
});

test('tilbud: kun https-links og fornuftige værdier', () => {
  const game = new Game();
  assert.throws(() => game.pushOffer({ title: 'X', url: 'javascript:alert(1)' }), /gyldigt link|https/);
  assert.throws(() => game.pushOffer({ title: '' }), /udfyldes/);
  const offer = game.pushOffer({ title: 'Flash', url: 'https://www.uniqperler.com/products/x', durationSec: 60, personal: true, discountPercent: 20 });
  assert.equal(game.activeOffers().length, 1);
  assert.equal(game.activeOffers(offer.expiresAt + 1).length, 0);
});

test('spillet kan gemmes og indlæses igen', () => {
  const game = new Game();
  game.addBots(5);
  game.start();
  game.draw();
  game.draw();
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(restored.drawn, game.drawn);
  assert.equal(restored.players.size, 5);
  assert.equal(restored.commitment, game.commitment);
  restored.draw();
  game.draw();
  assert.deepEqual(restored.drawn, game.drawn);
  assert.throws(() => restored.join({ username: 'Perle-Lise' }), /lukket/);
});
