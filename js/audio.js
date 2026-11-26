let ctx;
let muted = false;

// Couche 1 : grondement urbain / circulation
let trafficStarted = false;
let trafficGain = null;

// Couche 2 : brouhaha animé ("busy street")
let bustleStarted = false;
let bustleGain = null;
let bustleFilter = null;

// Couche 3 : vent en hauteur (100 % Web Audio API)
let windStarted = false;
let windGain = null;
let windFilter = null;

let currentAlt = 0;
let gustTimer = null;
let streetAccentTimer = null;
let lastWaveSample = 0;
let gustGainMult = 1;
let bustleWaveMult = 1;

export function init() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  ensureTrafficBed();
  ensureBusyStreetBed();
  ensureWindSynth();
  scheduleStreetAccents();
  applyMuteState();
}

function createNoiseBuffer(seconds, mode = 'white') {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);

  if (mode === 'white') {
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  // Bruit doux pour le vent d'altitude
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.996 * b0 + white * 0.032;
    b1 = 0.982 * b1 + white * 0.038;
    b2 = 0.945 * b2 + white * 0.052;
    data[i] = (b0 + b1 + b2 + white * 0.05) * 0.34;
  }
  return buf;
}

function ensureTrafficBed() {
  if (!ctx || trafficStarted) return;
  trafficStarted = true;

  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(4, 'white');
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 340;
  lp.Q.value = 0.7;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 95;
  lfo.connect(lfoGain);
  lfoGain.connect(lp.frequency);

  trafficGain = ctx.createGain();
  trafficGain.gain.value = 0.0001;

  src.connect(lp);
  lp.connect(trafficGain);
  trafficGain.connect(ctx.destination);

  src.start();
  lfo.start();
}

function ensureBusyStreetBed() {
  if (!ctx || bustleStarted) return;
  bustleStarted = true;

  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(4, 'white');
  src.loop = true;

  // Passe-bande centré sur les médiums pour simuler le brouhaha d'une rue animée
  bustleFilter = ctx.createBiquadFilter();
  bustleFilter.type = 'bandpass';
  bustleFilter.frequency.value = 920;
  bustleFilter.Q.value = 0.65;

  // Double modulation lente pour éviter un son statique
  const lfo1 = ctx.createOscillator();
  lfo1.type = 'sine';
  lfo1.frequency.value = 0.27;
  const g1 = ctx.createGain();
  g1.gain.value = 210;
  lfo1.connect(g1);
  g1.connect(bustleFilter.frequency);

  const lfo2 = ctx.createOscillator();
  lfo2.type = 'sine';
  lfo2.frequency.value = 0.61;
  const g2 = ctx.createGain();
  g2.gain.value = 95;
  lfo2.connect(g2);
  g2.connect(bustleFilter.frequency);

  bustleGain = ctx.createGain();
  bustleGain.gain.value = 0.0001;

  src.connect(bustleFilter);
  bustleFilter.connect(bustleGain);
  bustleGain.connect(ctx.destination);

  src.start();
  lfo1.start();
  lfo2.start();
}

function scheduleStreetAccents() {
  if (streetAccentTimer) clearTimeout(streetAccentTimer);
  const waitMs = 2400 + Math.random() * 3800;

  streetAccentTimer = setTimeout(() => {
    if (ctx && !muted && ctx.state === 'running' && currentAlt < 0.45) {
      const proximity = Math.pow(Math.max(0, 1 - currentAlt / 0.45), 1.5);
      // Petit coup de klaxon lointain et feutré typique de rue animée
      if (Math.random() < 0.65) {
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();

        o.type = 'sawtooth';
        const baseF = 390 + Math.random() * 90;
        o.frequency.setValueAtTime(baseF, now);

        lp.type = 'lowpass';
        lp.frequency.value = 780;

        const dur = 0.11 + Math.random() * 0.14;
        const peak = 0.008 * proximity;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        o.connect(lp);
        lp.connect(g);
        g.connect(ctx.destination);
        o.start(now);
        o.stop(now + dur + 0.02);
      }
    }
    scheduleStreetAccents();
  }, waitMs);
}

function ensureWindSynth() {
  if (!ctx || windStarted) return;
  windStarted = true;

  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(5, 'soft');
  src.loop = true;

  windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 190;
  windFilter.Q.value = 0.75;

  windGain = ctx.createGain();
  windGain.gain.value = 0.0001;

  src.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(ctx.destination);
  src.start();

  scheduleGustFrequency();
}

function scheduleGustFrequency() {
  if (gustTimer) clearTimeout(gustTimer);
  const waitMs = 2000 + Math.random() * 2600;

  gustTimer = setTimeout(() => {
    if (ctx && windFilter && !muted) {
      const now = ctx.currentTime;
      const nextFreq = 140 + Math.random() * 240;
      windFilter.frequency.cancelScheduledValues(now);
      windFilter.frequency.setValueAtTime(windFilter.frequency.value, now);
      windFilter.frequency.linearRampToValueAtTime(nextFreq, now + 1.6);
    }
    scheduleGustFrequency();
  }, waitMs);
}

function updateAmbienceMix(alt) {
  currentAlt = Math.max(0, Math.min(1, alt));

  const nowSec = performance.now() / 1000;
  if (nowSec - lastWaveSample > 0.25) {
    lastWaveSample = nowSec;
    const w1 = 0.5 + 0.3 * Math.sin(nowSec * 0.42) + 0.2 * Math.sin(nowSec * 1.07 + 0.8);
    const w2 = 0.5 + 0.35 * Math.sin(nowSec * 0.73 + 2.1) + 0.15 * Math.sin(nowSec * 1.61);
    gustGainMult = 0.68 + w1 * 0.62;
    bustleWaveMult = 0.75 + w2 * 0.5;
  }

  const streetFactor = Math.pow(Math.max(0, 1 - currentAlt / 0.52), 1.65);

  if (ctx && trafficGain) {
    if (muted || ctx.state !== 'running') {
      trafficGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
    } else {
      trafficGain.gain.setTargetAtTime(Math.max(0.0001, streetFactor * 0.045), ctx.currentTime, 0.16);
    }
  }

  if (ctx && bustleGain) {
    if (muted || ctx.state !== 'running') {
      bustleGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
    } else {
      bustleGain.gain.setTargetAtTime(
        Math.max(0.0001, streetFactor * 0.032 * bustleWaveMult),
        ctx.currentTime,
        0.16
      );
    }
  }

  if (ctx && windGain) {
    if (muted || ctx.state !== 'running') {
      windGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
    } else {
      const heightFactor = Math.pow(Math.max(0, (currentAlt - 0.12) / 0.88), 1.5);
      const windVol = Math.max(0.0001, heightFactor * 0.09 * gustGainMult);
      windGain.gain.setTargetAtTime(windVol, ctx.currentTime, 0.28);
    }
  }
}

export function setAltitudeAmbience(alt = 0) {
  updateAmbienceMix(alt);
}

export function setStreetAmbience(alt = 0) {
  updateAmbienceMix(alt);
}

function applyMuteState() {
  if (muted) {
    if (ctx) {
      if (trafficGain) trafficGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      if (bustleGain) bustleGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      if (windGain) windGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    }
  } else {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    updateAmbienceMix(currentAlt);
  }
}

export function toggleMute() {
  muted = !muted;
  applyMuteState();
  return muted;
}

function tone(freq, type, dur, vol = 0.08, delay = 0, slideTo = null) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  click() { tone(520, 'triangle', 0.06, 0.07, 0, 760); },
  type() { tone(240 + Math.random() * 90, 'sine', 0.035, 0.035); },
  tick() { tone(880, 'sine', 0.045, 0.05); },
  round(r) {
    const base = 330 + r * 35;
    tone(base, 'triangle', 0.12, 0.07, 0);
    tone(base * 1.25, 'triangle', 0.14, 0.07, 0.08);
  },
  wrong() {
    tone(220, 'sawtooth', 0.18, 0.055, 0, 145);
  },
  partial() {
    tone(440, 'triangle', 0.12, 0.07, 0);
    tone(554.37, 'triangle', 0.16, 0.07, 0.08);
  },
  correct(streak = 0) {
    const boost = Math.min(streak, 6) * 24;
    tone(523.25 + boost, 'triangle', 0.12, 0.08, 0);
    tone(659.25 + boost, 'triangle', 0.12, 0.08, 0.07);
    tone(783.99 + boost, 'triangle', 0.22, 0.09, 0.14);
  },
  bonus() {
    tone(1046.5, 'sine', 0.14, 0.07, 0);
    tone(1318.5, 'sine', 0.22, 0.07, 0.07);
  },
  reveal() {
    tone(587.33, 'sine', 0.18, 0.06, 0, 880);
  },
  rooftop() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, 'triangle', 0.25, 0.075, i * 0.11);
    });
  },
  heli() {
    for (let i = 0; i < 8; i++) {
      tone(95, 'sawtooth', 0.16, 0.045, i * 0.18, 82);
    }
  },
};