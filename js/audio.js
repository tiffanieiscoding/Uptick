let ctx;
let muted = false;

export function init() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
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