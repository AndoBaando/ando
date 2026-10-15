// Storskærm til live-streamen (OBS "Browser source") eller en skærm i butikken. Kun offentlige data.
import { $, fill, connectStream, stagePills, board, STAGE_LABELS } from './common.js';

let lastCount = 0;

connectStream('/api/stream/public', {
  onEvent: (event, s) => {
    if (event !== 'state') return;
    const last = s.drawn.at(-1);
    const ball = $('#ball');
    ball.textContent = last ?? (s.status === 'finished' ? 'Slut' : 'Klar?');
    ball.className = `ball ${last ? '' : 'empty'}`;
    if (s.drawn.length > lastCount) {
      void ball.offsetWidth; // genstart animationen
      ball.classList.add('pop');
    }
    lastCount = s.drawn.length;
    fill($('#stages'), stagePills(s.stage, s.status));
    fill($('#board'), board(s.drawn));

    const nearly = $('#nearly');
    nearly.hidden = !s.nearlyCount;
    nearly.textContent = `🔥 ${s.nearlyCount} ${s.nearlyCount === 1 ? 'spiller mangler' : 'spillere mangler'} kun 1 tal!`;

    const w = s.winners.at(-1);
    const winner = $('#winner');
    winner.hidden = !w;
    if (w) winner.textContent = `🏆 ${w.username} vandt ${STAGE_LABELS[w.stage]}`;
  },
});
