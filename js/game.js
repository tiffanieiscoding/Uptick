import { scoreDate, scoreNumber, scoreName } from './scoring.js';
import * as audio from './audio.js';
import { Scene, SKINS } from './scene.js';

const ROUNDS = 7;
const ROOFTOP_AVG = 0.88;
const PERFECT = 0.97;
const FLOORS = 60;
const TIME_LIMIT = 15;
const BONUS_WINDOW = 2;
const BONUS = 0.1;
const BONUS_MIN = 0.5;
const PLAN = ['mcq', 'date', 'mcq', 'number', 'name', 'mcq', 'date'];
const HINT = 'M = mute · F = fullscreen · Enter = confirm / next';
const LABEL = {
  mcq: 'MULTIPLE CHOICE',
  date: 'PLACE THE YEAR',
  number: 'ESTIMATE',
  name: 'NAME IT',
};

const $ = (id) => document.getElementById(id);

function shuffle(arr) {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = r[i];
    r[i] = r[j];
    r[j] = tmp;
  }
  return r;
}

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

function fmtBig(n) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US');
  return fmt(n);
}

export class Game {
  constructor(questions) {
    this.all = questions;
    this.canvas = $('scene');
    this.scene = new Scene(this.canvas);
    this.state = 'title';
    this.look = this.loadLook();
    this.lastPopSpot = -1;
    this.scene.setLook(this.look);
    this.fit();

    window.addEventListener('resize', () => this.fit());
    window.addEventListener('keydown', (e) => this.onKey(e));
    $('nextBtn').addEventListener('click', () => this.advance());

    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    this.showTitle();
  }

  loadLook() {
    try {
      const raw = localStorage.getItem('uptick-look');
      const v = raw ? JSON.parse(raw) : null;
      if (v && SKINS[v.skin]) return v;
    } catch (e) {
      // ignore storage errors
    }
    return { skin: 3, hair: 1 };
  }

  saveLook() {
    try {
      localStorage.setItem('uptick-look', JSON.stringify(this.look));
    } catch (e) {
      // ignore storage errors
    }
  }

  fit() {
    const S = Math.max(1, Math.round(window.innerHeight / 270));
    const w = Math.ceil(window.innerWidth / S);
    const h = Math.ceil(window.innerHeight / S);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = w * S + 'px';
    this.canvas.style.height = h * S + 'px';
    this.scene.resize(w, h);
  }

  toggleFullscreen() {
    const d = document;
    const el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.scene.update(dt);
    this.scene.draw();
    if (this.state === 'asking') this.tickTimer();
    $('hudFloor').textContent = `FLOOR ${Math.round(this.scene.alt * FLOORS)}/${FLOORS}`;
    requestAnimationFrame((t) => this.loop(t));
  }

  showTitle() {
    this.state = 'title';
    this.scene.reset();
    this.scene.setRoofArrived(false);
    $('qwrap').hidden = true;
    $('timer').hidden = true;
    $('hudRound').textContent = 'UPTICK';

    const ov = $('overlay');
    ov.innerHTML = `
      <div class="card">
        <h1 class="logo">UPTICK</h1>
        <p class="tag">Answer well. Climb higher. Reach the rooftop at night.</p>
        <div class="row"><span class="lbl">Skin</span><span id="skins"></span></div>
        <div class="row"><span class="lbl">Hair</span>
          <button data-hair="0">Short</button><button data-hair="1">Long</button></div>
        <button class="big" id="startBtn">PRESS ENTER</button>
      </div>`;

    const skins = ov.querySelector('#skins');
    SKINS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'sw' + (i === this.look.skin ? ' on' : '');
      b.style.background = c;
      b.setAttribute('aria-label', 'Skin tone ' + (i + 1));
      b.addEventListener('click', () => {
        this.look.skin = i;
        this.refreshLook();
        audio.init();
        audio.sfx.click();
      });
      skins.appendChild(b);
    });

    ov.querySelectorAll('[data-hair]').forEach((b) => {
      b.addEventListener('click', () => {
        this.look.hair = Number(b.dataset.hair);
        this.refreshLook();
        audio.init();
        audio.sfx.click();
      });
    });

    ov.querySelector('#startBtn').addEventListener('click', () => this.start());
    this.refreshLook();
  }

  refreshLook() {
    this.scene.setLook(this.look);
    this.saveLook();
    document.querySelectorAll('#overlay .sw').forEach((b, i) => {
      b.classList.toggle('on', i === this.look.skin);
    });
    document.querySelectorAll('#overlay [data-hair]').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.hair) === this.look.hair);
    });
  }

  start() {
    audio.init();
    this.scores = [];
    this.bonuses = [];
    this.used = new Set();
    this.round = 0;
    this.streak = 0;
    this.scene.reset();
    this.scene.setRoofArrived(false);
    $('overlay').innerHTML = '';
    this.nextRound();
  }

  pick(type, r) {
    const pool = this.all.filter((q) => q.type === type && !this.used.has(q.id));
    const list = pool.length ? pool : this.all.filter((q) => !this.used.has(q.id));
    return list
      .map((q) => ({ q, k: Math.abs(q.level - (r + 1)) + Math.random() * 1.4 }))
      .sort((a, b) => a.k - b.k)[0].q;
  }

  nextRound() {
    if (this.round >= ROUNDS) return this.finish();
    const q = this.pick(PLAN[this.round], this.round);
    this.used.add(q.id);
    this.q = q;
    this.tries = 0;
    this.state = 'asking';
    audio.sfx.round(this.round);

    $('hudRound').textContent = `ROUND ${this.round + 1}/${ROUNDS}`;
    $('qMeta').textContent = `ROUND ${this.round + 1} / ${ROUNDS}  ·  ${LABEL[q.type]}`;
    $('qText').textContent = q.q;
    $('tryMsg').innerHTML = '';
    $('feedback').innerHTML = '';
    $('nextBtn').hidden = true;
    $('timeline').hidden = true;

    $('qwrap').hidden = false;
    $('qwrap').classList.remove('dock');
    $('askView').hidden = false;
    $('resultView').hidden = true;

    this.opts = null;
    this.inp = null;
    this.guess = null;
    this.lastTick = null;

    const timer = $('timer');
    timer.hidden = false;
    timer.className = 'fast';
    timer.style.setProperty('--bonus-w', (BONUS_WINDOW / TIME_LIMIT) * 100 + '%');
    $('timerBonus').textContent = `FAST +${Math.round(BONUS * 100)}`;
    $('timerBar').style.width = '100%';
    $('timerNum').textContent = TIME_LIMIT;

    if (q.type === 'mcq') this.renderMcq(q);
    else this.renderInput(q);

    this.qStart = performance.now();
  }

  renderMcq(q) {
    const box = $('answer');
    box.innerHTML = '';
    this.opts = shuffle(q.options).map((text, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = `<span class="k">${i + 1}</span><span></span>`;
      b.lastChild.textContent = text;
      b.addEventListener('click', () => this.pickOpt(i));
      box.appendChild(b);
      return { text, el: b };
    });
  }

  pickOpt(i) {
    if (this.state !== 'asking') return;
    const o = this.opts[i];
    if (o.el.disabled) return;
    if (o.text === this.q.answer) {
      o.el.classList.add('right');
      this.reveal(this.tries === 0 ? 1 : 0.5, this.tries === 0 ? 'Correct.' : 'Correct on the second try.');
    } else if (this.tries === 0) {
      this.tries = 1;
      o.el.classList.add('wrong');
      o.el.disabled = true;
      audio.sfx.wrong();
      $('tryMsg').innerHTML = '<span class="bad">Not quite.</span> One more try for half points.';
    } else {
      o.el.classList.add('wrong');
      this.opts.find((x) => x.text === this.q.answer).el.classList.add('right');
      this.reveal(0, 'Missed.');
    }
  }

  renderInput(q) {
    const box = $('answer');
    const ph = q.type === 'date' ? 'Type a year' : q.type === 'number' ? 'Type a number' : 'Type a name';
    box.innerHTML = `<div class="field"><input id="inp" autocomplete="off" spellcheck="false" placeholder="${ph}"><button id="lock">Lock in</button></div>`;
    this.inp = $('inp');
    this.inp.focus();
    $('lock').addEventListener('click', () => this.submit());
    if (q.type !== 'name') this.buildTimeline(q);
    this.inp.addEventListener('input', () => {
      audio.sfx.type();
      this.previewGuess();
    });
  }

  pos(v) {
    const [a, b] = this.q.range;
    const x = this.q.type === 'number'
      ? (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a))
      : (v - a) / (b - a);
    return Math.max(0, Math.min(1, x)) * 100;
  }

  buildTimeline(q) {
    const tl = $('timeline');
    tl.hidden = false;
    const [a, b] = q.range;
    let ticks = q.ticks || [];
    if (q.type === 'number') {
      ticks = [];
      for (let v = Math.pow(10, Math.ceil(Math.log10(a))); v <= b; v *= 10) {
        ticks.push({ v, l: fmtBig(v) });
      }
    }
    const f = q.type === 'number' ? fmtBig : fmt;
    const all = [{ v: a, l: f(a), end: true }, ...ticks, { v: b, l: f(b), end: true }];
    tl.innerHTML =
      '<div class="axis"></div>' +
      all.map((t) => `<div class="tick${t.end ? '' : ' top'}" style="left:${this.pos(t.v)}%"><span>${t.l}</span></div>`).join('') +
      '<div class="gap"></div><div class="mk truth"><span></span></div><div class="mk guess" hidden><span></span></div>';
  }

  parse(raw) {
    const s = String(raw).trim().replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }

  previewGuess() {
    if (this.q.type === 'name') return;
    const v = this.parse(this.inp.value);
    const g = $('timeline').querySelector('.guess');
    if (v === null || (this.q.type === 'number' && v <= 0)) {
      g.hidden = true;
      return;
    }
    g.hidden = false;
    g.style.left = this.pos(v) + '%';
    g.firstChild.textContent = fmt(v);
  }

  submit() {
    if (this.state !== 'asking') return;
    const q = this.q;
    if (q.type === 'name') {
      if (!this.inp.value.trim()) return this.shake();
      const s = scoreName(this.inp.value, q.accepted);
      return this.reveal(s, s ? 'Correct.' : `It was ${q.display}.`);
    }
    const v = this.parse(this.inp.value);
    if (v === null || (q.type === 'number' && v <= 0)) return this.shake();
    this.guess = v;
    if (q.type === 'date') {
      const s = scoreDate(v, q.answer, q.precise, q.tol);
      const e = Math.abs(v - q.answer);
      this.reveal(s, e === 0 ? 'Exactly right.' : `Off by ${e} year${e > 1 ? 's' : ''}.`);
    } else {
      const s = scoreNumber(v, q.answer, q.precise, q.tolFactor);
      const ratio = Math.max(v / q.answer, q.answer / v);
      this.reveal(s, ratio < 1.05 ? 'Almost spot on.' : `Off by a factor of ${Math.round(ratio * 10) / 10}.`);
    }
  }

  shake() {
    this.inp.classList.remove('shake');
    void this.inp.offsetWidth;
    this.inp.classList.add('shake');
  }

  total() {
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    return sum(this.scores) + sum(this.bonuses);
  }

  tickTimer() {
    const el = (performance.now() - this.qStart) / 1000;
    const left = Math.max(0, TIME_LIMIT - el);
    $('timerBar').style.width = (left / TIME_LIMIT) * 100 + '%';
    $('timerNum').textContent = Math.ceil(left);
    const t = $('timer');
    t.classList.toggle('fast', el < BONUS_WINDOW);
    t.classList.toggle('low', left <= 5);
    t.classList.toggle('crit', left <= 3);
    const sec = Math.ceil(left);
    if (left <= 3 && left > 0 && sec !== this.lastTick) {
      this.lastTick = sec;
      audio.sfx.tick();
    }
    if (left <= 0) this.timeUp();
  }

  timeUp() {
    if (this.state !== 'asking') return;
    const q = this.q;
    if (q.type === 'mcq') {
      this.opts.find((o) => o.text === q.answer).el.classList.add('right');
      return this.reveal(0, "Time's up.");
    }
    if (this.inp && this.inp.value.trim()) this.submit();
    if (this.state !== 'asking') return;
    this.reveal(0, q.type === 'name' ? `Time's up. It was ${q.display}.` : "Time's up.");
  }

  spawnScorePop(points) {
    if (!points || points <= 0) return;

    const pop = document.createElement('div');
    const styleMode = Math.random() < 0.65 ? 'funk' : 'clean';
    pop.className = `score-pop ${styleMode}`;
    pop.textContent = `+${points}`;

    const spots = [
      { x: 11, y: 26, rot: -7 },
      { x: 89, y: 26, rot: 7 },
      { x: 10, y: 42, rot: -5 },
      { x: 90, y: 42, rot: 5 },
      { x: 13, y: 56, rot: -6 },
      { x: 87, y: 56, rot: 6 },
    ];

    let idx = Math.floor(Math.random() * spots.length);
    if (idx === this.lastPopSpot) idx = (idx + 1) % spots.length;
    this.lastPopSpot = idx;

    const spot = spots[idx];
    const jx = (Math.random() - 0.5) * 3;
    const jy = (Math.random() - 0.5) * 4;
    pop.style.left = `${Math.max(6, Math.min(94, spot.x + jx))}%`;
    pop.style.top = `${Math.max(18, Math.min(65, spot.y + jy))}%`;
    pop.style.setProperty('--rot', `${spot.rot}deg`);

    if (styleMode === 'funk') {
      const funkColors = ['#f472b6', '#ec4899', '#4ade80', '#22c55e'];
      pop.style.color = funkColors[Math.floor(Math.random() * funkColors.length)];
    }

    document.body.appendChild(pop);
    pop.addEventListener('animationend', () => pop.remove(), { once: true });
  }

  reveal(score, msg) {
    this.state = 'reveal';
    const q = this.q;
    const elapsed = (performance.now() - this.qStart) / 1000;
    const bonus = score >= BONUS_MIN && elapsed <= BONUS_WINDOW ? BONUS : 0;
    this.scores.push(score);
    this.bonuses.push(bonus);
    $('timer').classList.remove('fast');

    const totalPts = Math.round((score + bonus) * 100);
    if (totalPts > 0) this.spawnScorePop(totalPts);

    if (this.inp) this.inp.disabled = true;
    const lock = $('lock');
    if (lock) lock.disabled = true;
    if (this.opts) this.opts.forEach((o) => { o.el.disabled = true; });

    if (q.type === 'date' || q.type === 'number') {
      const tl = $('timeline');
      const t = tl.querySelector('.truth');
      const gap = tl.querySelector('.gap');
      t.firstChild.textContent = fmt(q.answer);
      setTimeout(() => {
        t.style.left = this.pos(q.answer) + '%';
        t.classList.add('show');
        if (typeof this.guess === 'number') {
          const a = this.pos(this.guess);
          const b = this.pos(q.answer);
          gap.style.left = Math.min(a, b) + '%';
          gap.style.width = Math.abs(a - b) + '%';
          gap.classList.add('show');
        }
        audio.sfx.reveal();
      }, 300);
    }

    if (score >= 0.6) {
      audio.sfx.correct(this.streak);
      this.streak++;
    } else if (score > 0) {
      audio.sfx.partial(this.streak);
      this.streak = 0;
    } else {
      audio.sfx.wrong();
      this.streak = 0;
    }
    if (bonus) setTimeout(() => audio.sfx.bonus(), 160);

    const pts = Math.round(score * 100);
    const cls = score >= 0.75 ? 'good' : score > 0.25 ? 'mid' : 'bad';
    const bonusTxt = bonus ? `<span class="bonus">+${Math.round(bonus * 100)} speed bonus (${elapsed.toFixed(1)}s)</span>` : '';
    const ansTxt = q.type === 'mcq' && score < 1 ? '<span class="ans"></span>' : '';
    $('feedback').innerHTML = `<span class="pts ${cls}">+${pts}</span> ${msg}${bonusTxt}${ansTxt}<span class="fact"></span>`;
    if (ansTxt) $('feedback').querySelector('.ans').textContent = `Answer: ${q.answer}`;
    $('feedback').querySelector('.fact').textContent = q.fact || '';

    $('askView').hidden = true;
    $('resultView').hidden = false;
    $('qwrap').classList.add('dock');

    const isLastRound = this.round + 1 >= ROUNDS;
    const isPerfectSoFar = isLastRound && this.scores.every((s) => s >= PERFECT);
    this.scene.setTarget(this.total() / (ROUNDS * ROOFTOP_AVG));
    if (isPerfectSoFar) this.scene.setRoofArrived(true);
    this.round++;

    const nb = $('nextBtn');
    nb.textContent = this.round >= ROUNDS ? 'See the view ›' : 'Next ›';
    setTimeout(() => {
      if (this.state === 'reveal') nb.hidden = false;
    }, 700);
  }

  advance() {
    if (this.state !== 'reveal' || $('nextBtn').hidden) return;
    audio.sfx.click();
    this.nextRound();
  }

  finish() {
    this.state = 'end';
    $('timer').hidden = true;
    $('qwrap').hidden = true;
    const sum = this.total();
    const alt = Math.min(1, sum / (ROUNDS * ROOFTOP_AVG));
    const perfect = this.scores.every((s) => s >= PERFECT);
    this.scene.setTarget(alt);
    this.scene.setRoofArrived(perfect || alt >= 0.999);

    let wait = 2600;
    if (perfect) {
      wait = 9000;
      audio.sfx.heli();
      setTimeout(() => this.scene.startHeli(), 2600);
    } else if (alt >= 0.999) {
      setTimeout(() => audio.sfx.rooftop(), 2200);
    }
    setTimeout(() => this.showEnd(alt, sum, perfect), wait);
  }

  showEnd(alt, sum, perfect) {
    if (this.state !== 'end') return;
    const base = this.scores.reduce((a, b) => a + b, 0);
    const bonusSum = this.bonuses.reduce((a, b) => a + b, 0);
    const title = perfect ? 'Perfect. Helicopter out.'
      : alt >= 0.999 ? 'Rooftop. City lights.'
      : alt >= 0.85 ? 'First stars'
      : alt >= 0.6 ? 'Sunset'
      : alt >= 0.35 ? 'Golden hour'
      : 'Still daylight';
    const rows = this.scores
      .map((s, i) => `<div><span>${i + 1}. ${LABEL[PLAN[i]].toLowerCase()}</span><span>${Math.round(s * 100)}${this.bonuses[i] ? ' +' + Math.round(this.bonuses[i] * 100) : ''}</span></div>`)
      .join('');
    $('overlay').innerHTML = `
      <div class="card">
        <h1 class="logo" style="font-size:${perfect ? 18 : 22}px">${title}</h1>
        <p class="tag">Floor ${Math.round(alt * FLOORS)} of ${FLOORS} &middot; ${Math.round((base / ROUNDS) * 100)}% average${bonusSum ? ` &middot; +${Math.round(bonusSum * 100)} speed` : ''}</p>
        <div class="res">${rows}</div>
        <button class="big" id="againBtn">PLAY AGAIN (ENTER)</button>
        <button id="viewBtn" style="display:block;margin:10px auto 0">Admire the view</button>
      </div>`;
    $('againBtn').addEventListener('click', () => this.start());
    $('viewBtn').addEventListener('click', () => {
      $('overlay').innerHTML = '<button class="big" id="againBtn" style="position:absolute;right:10px;bottom:10px;margin:0">PLAY AGAIN (ENTER)</button>';
      $('againBtn').addEventListener('click', () => this.start());
    });
  }

  onKey(e) {
    if (e.key === 'm' || e.key === 'M') {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      audio.init();
      $('hint').textContent = audio.toggleMute() ? 'Sound off (M)' : HINT;
      return;
    }
    if ((e.key === 'f' || e.key === 'F') && !(document.activeElement && document.activeElement.tagName === 'INPUT')) {
      return this.toggleFullscreen();
    }
    audio.init();
    if (this.state === 'title' && e.key === 'Enter') return this.start();
    if (this.state === 'end' && e.key === 'Enter' && $('againBtn')) return this.start();
    if (this.state === 'asking') {
      if (this.q.type === 'mcq' && /^[1-4]$/.test(e.key)) return this.pickOpt(Number(e.key) - 1);
      if (this.q.type !== 'mcq' && e.key === 'Enter') return this.submit();
    }
    if (this.state === 'reveal' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.advance();
    }
  }
}