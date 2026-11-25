export const WORLD = 1200;
const TOP = WORLD + 70;
const TW = 96;

export const SKINS = ['#ffdbb4', '#e8b48a', '#c68642', '#8d5524', '#5c3a21', '#3b2417'];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
}

const PAL = {
  day:    { skyTop: '#5b9bd5', skyBot: '#dbe7f4', far: '#93a8c1', mid: '#627892', near: '#334458', tower: '#161b24', glass: '#28384d', winOff: '#3d516b', winOn: '#fef08a' },
  sunset: { skyTop: '#2e296e', skyBot: '#f59356', far: '#99769e', mid: '#685375', near: '#322b40', tower: '#151421', glass: '#2b2840', winOff: '#484261', winOn: '#fde68a' },
  night:  { skyTop: '#080c15', skyBot: '#1b263b', far: '#1c2536', mid: '#131a27', near: '#0c111b', tower: '#0f131c', glass: '#1a2333', winOff: '#1f293b', winOn: '#fde047' },
};

function colorAt(key, alt) {
  const k = 0.55;
  if (alt <= k) return mix(PAL.day[key], PAL.sunset[key], smooth(0, k, alt));
  return mix(PAL.sunset[key], PAL.night[key], smooth(k, 1, alt));
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hash(a, b, c) {
  let n = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  n = (((n ^ (n >>> 13)) >>> 0) * 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function genLayer(seed, width, minW, maxW, minH, maxH, tanks) {
  const r = rng(seed);
  const out = [];
  let x = -10;
  while (x < width + 10) {
    const w = Math.floor(minW + r() * (maxW - minW));
    const h = Math.floor(minH + r() * (maxH - minH));
    out.push({ x, w, h, spire: r() < 0.18, tank: tanks && r() < 0.4, seed: Math.floor(r() * 1e6) });
    x += w + Math.floor(r() * 4);
  }
  return out;
}

const COAT_COLORS = [
  '#1e293b', '#0f172a', '#334155', '#475569', '#b45309',
  '#dc2626', '#0284c7', '#1d4ed8', '#047857', '#6d28d9', '#be185d', '#d97706',
];
const PANT_COLORS = ['#0f172a', '#1e293b', '#334155', '#1e3a5f', '#27272a'];

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.alt = 0;
    this.target = 0;
    this.t = 0;
    this.look = { skin: 3, hair: 1 };
    this.heli = null;
    this.roofArrived = false;
    this.carts = [];
    this.pedestrians = [];
    this.resize(canvas.width, canvas.height);
  }

  resize(w, h) {
    this.W = w;
    this.H = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;

    this.tx = Math.round(w / 2 - TW / 2);
    this.groundY = Math.round(h - 28);
    const k = h / 270;
    this.layers = [
      { key: 'far',  par: 0.08, wins: 'dots', blds: genLayer(11, w, 16, 32, 95 * k, 185 * k, false) },
      { key: 'mid',  par: 0.28, wins: 'full', blds: genLayer(23, w, 24, 46, 55 * k, 125 * k, false) },
      { key: 'near', par: 0.65, wins: 'full', blds: genLayer(37, w, 28, 52, 28 * k, 68 * k, true) },
    ];
    const area = (w * h) / (480 * 270);
    this.stars = Array.from({ length: Math.round(75 * area) }, (_, i) => ({
      x: hash(i, 1, 7) * w,
      y: hash(i, 2, 7) * h * 0.56,
      r: hash(i, 3, 7) < 0.18 ? 1.5 : 0.9,
    }));
    this.clouds = Array.from({ length: Math.max(4, Math.round(5 * (w / 480))) }, (_, i) => ({
      x: hash(i, 4, 9) * w,
      y: h * 0.08 + hash(i, 5, 9) * h * 0.30,
      w: 36 + hash(i, 6, 9) * 36,
    }));

    this.carts = [
      { x: this.tx - 54, accent: '#f59e0b', trim: '#dc2626' },
      { x: this.tx + TW + 34, accent: '#fbbf24', trim: '#ea580c' },
    ];

    const count = Math.max(14, Math.round(16 * (w / 480)));
    const span = w + 60;
    this.pedestrians = Array.from({ length: count }, (_, i) => ({
      speed: 9 + hash(i, 11, 3) * 8,
      dir: i % 2 === 0 ? 1 : -1,
      offset: (i / count) * span + hash(i, 12, 3) * 18,
      skin: SKINS[i % SKINS.length],
      coat: COAT_COLORS[i % COAT_COLORS.length],
      pants: PANT_COLORS[i % PANT_COLORS.length],
      phase: hash(i, 13, 3) * Math.PI * 2,
      depth: (i % 3) * 1.3,
      briefcase: hash(i, 14, 3) < 0.45,
      longHair: hash(i, 15, 3) < 0.45,
    }));
  }

  reset() { this.alt = 0; this.target = 0; this.heli = null; this.roofArrived = false; }
  setTarget(v) { this.target = clamp(v); }
  setLook(look) { this.look = { ...look }; }
  setRoofArrived(v) { this.roofArrived = !!v; }
  get moving() { return Math.abs(this.target - this.alt) > 0.003; }
  get camY() { return this.alt * WORLD; }
  startHeli() { this.heli = { t: 0 }; }
  get heliDone() { return !!this.heli && this.heli.t >= 1; }

  update(dt) {
    this.t += dt;
    const d = this.target - this.alt;
    if (Math.abs(d) > 0.0005) {
      const step = Math.max(Math.abs(d) * Math.min(1, dt * 1.6), 0.02 * dt);
      this.alt += Math.sign(d) * Math.min(Math.abs(d), step);
    }
    if (this.heli) this.heli.t = Math.min(1, this.heli.t + dt / 7);
  }

  sy(wy, par = 1) {
    return Math.round(this.groundY - (wy - this.camY * par));
  }

  draw() {
    const c = this.ctx;
    const alt = this.alt;
    this.drawSky(c, alt);
    this.drawSkyObjects(c, alt);
    this.drawLayer(c, this.layers[0], alt);
    this.drawLayer(c, this.layers[1], alt);
    this.drawLayer(c, this.layers[2], alt);
    this.drawStreet(c, alt);
    this.drawTower(c, alt);
    this.drawLobbyEntrance(c, alt);
    this.drawHalalCarts(c, alt);
    this.drawPedestrians(c);
    this.drawRoof(c, alt);
    this.drawCabin(c);
    if (this.heli) this.drawHeli(c);
  }

  drawSky(c, alt) {
    const g = c.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, colorAt('skyTop', alt));
    g.addColorStop(1, colorAt('skyBot', alt));
    c.fillStyle = g;
    c.fillRect(0, 0, this.W, this.H);
  }

  drawSkyObjects(c, alt) {
    const { W, H } = this;
    const night = smooth(0.62, 0.95, alt);
    if (night > 0) {
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        c.globalAlpha = night * (0.45 + 0.55 * Math.sin(this.t * 2 + i));
        c.fillStyle = '#f8fafc';
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = night;
      const mx = Math.round(W * 0.18);
      const my = Math.round(H * 0.18 + (1 - night) * H * 0.08);
      const glow = c.createRadialGradient(mx, my, 4, mx, my, 28);
      glow.addColorStop(0, 'rgba(248, 250, 252, 0.28)');
      glow.addColorStop(1, 'rgba(248, 250, 252, 0)');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(mx, my, 28, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#f8fafc';
      c.beginPath();
      c.arc(mx, my, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#cbd5e1';
      c.beginPath();
      c.arc(mx + 2.5, my - 1, 1.6, 0, Math.PI * 2);
      c.arc(mx - 2, my + 2.5, 1.2, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }

    const day = 1 - smooth(0.05, 0.62, alt);
    if (day > 0) {
      const sx = Math.round(W * 0.82);
      const sy = Math.round(H * 0.20 + smooth(0.1, 0.6, alt) * H * 0.42);
      const sunGlow = c.createRadialGradient(sx, sy, 6, sx, sy, 34);
      sunGlow.addColorStop(0, `rgba(254, 240, 138, ${day * 0.55})`);
      sunGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
      c.fillStyle = sunGlow;
      c.beginPath();
      c.arc(sx, sy, 34, 0, Math.PI * 2);
      c.fill();

      c.globalAlpha = day;
      c.fillStyle = '#fef08a';
      c.beginPath();
      c.arc(sx, sy, 12, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }

    const cl = (1 - smooth(0.35, 0.8, alt)) * 0.35;
    if (cl > 0) {
      c.globalAlpha = cl;
      c.fillStyle = '#f8fafc';
      for (const k of this.clouds) {
        const x = ((k.x + this.t * 4) % (W + 100)) - 50;
        const y = k.y - this.camY * 0.05;
        c.beginPath();
        c.roundRect(x, y, k.w, 8, 4);
        c.roundRect(x + k.w * 0.16, y - 5, k.w * 0.55, 8, 4);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  litProb(alt) { return 0.06 + smooth(0.4, 1, alt) * 0.72; }

  drawLayer(c, layer, alt) {
    const H = this.H;
    const base = colorAt(layer.key, alt);
    const on = colorAt('winOn', alt);
    const off = colorAt('winOff', alt);
    const lit = this.litProb(alt);
    for (const b of layer.blds) {
      const top = this.sy(b.h, layer.par);
      if (top >= H) continue;
      c.fillStyle = base;
      c.beginPath();
      c.roundRect(b.x, top, b.w, H - top + 4, [2, 2, 0, 0]);
      c.fill();

      if (b.spire) {
        c.fillStyle = base;
        c.fillRect(b.x + Math.floor(b.w / 2), top - 11, 1.5, 11);
      }
      if (b.tank) {
        c.fillStyle = base;
        c.beginPath();
        c.roundRect(b.x + 4, top - 8, 9, 8, 1.5);
        c.fill();
      }

      if (layer.wins === 'full') {
        for (let col = 0, x = b.x + 3; x < b.x + b.w - 4; col++, x += 6) {
          for (let row = 0, y = top + 5; y < H - 2; row++, y += 7) {
            if (y < -6) continue;
            const isOn = hash(b.seed, col, row) < lit;
            c.fillStyle = isOn ? on : off;
            c.globalAlpha = isOn ? 0.85 : 0.45;
            c.fillRect(x, y, 2.5, 3.5);
          }
        }
        c.globalAlpha = 1;
      } else if (lit > 0.25) {
        c.fillStyle = on;
        c.globalAlpha = 0.55;
        for (let col = 0, x = b.x + 2; x < b.x + b.w - 2; col++, x += 4) {
          for (let row = 0, y = top + 4; y < Math.min(H, top + 90); row++, y += 6) {
            if (hash(b.seed, col, row) < lit * 0.6) c.fillRect(x, y, 1.5, 1.5);
          }
        }
        c.globalAlpha = 1;
      }
    }
  }

  drawStreet(c, alt) {
    const { W, H } = this;
    const gy = this.sy(0, 1);
    if (gy >= H + 10) return;

    const walkH = 12;
    c.fillStyle = mix('#cbd5e1', '#334155', smooth(0.3, 0.9, alt));
    c.fillRect(0, gy - 2, W, walkH);

    c.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    c.lineWidth = 0.8;
    for (let x = 0; x < W; x += 14) {
      c.beginPath();
      c.moveTo(x, gy - 2);
      c.lineTo(x, gy + walkH - 2);
      c.stroke();
    }

    c.fillStyle = 'rgba(255, 255, 255, 0.22)';
    c.fillRect(0, gy + walkH - 3, W, 1.2);

    const roadY = gy + walkH - 2;
    if (roadY < H) {
      c.fillStyle = mix('#334155', '#090d16', smooth(0.2, 0.85, alt));
      c.fillRect(0, roadY, W, H - roadY);

      c.fillStyle = 'rgba(248, 250, 252, 0.35)';
      for (let x = 12; x < W; x += 28) {
        c.fillRect(x, roadY + 7, 14, 1.5);
      }

      const cabX = ((this.t * 26) % (W + 140)) - 70;
      const cabY = roadY + 2;
      c.fillStyle = 'rgba(0, 0, 0, 0.35)';
      c.beginPath();
      c.roundRect(cabX + 1, cabY + 7.5, 24, 2.5, 1.2);
      c.fill();

      c.fillStyle = '#facc15';
      c.beginPath();
      c.roundRect(cabX, cabY + 3, 25, 5, 1.8);
      c.roundRect(cabX + 5, cabY, 13, 4, 2);
      c.fill();

      c.fillStyle = '#1e293b';
      c.fillRect(cabX + 6.5, cabY + 1, 4.5, 2.2);
      c.fillRect(cabX + 12, cabY + 1, 4.5, 2.2);

      c.fillStyle = '#fef9c3';
      c.fillRect(cabX + 10, cabY - 1.2, 3, 1.2);
      c.fillStyle = '#fef08a';
      c.fillRect(cabX + 24, cabY + 4.5, 1.5, 1.5);

      c.fillStyle = '#0f172a';
      c.beginPath();
      c.arc(cabX + 5.5, cabY + 8, 2, 0, Math.PI * 2);
      c.arc(cabX + 19.5, cabY + 8, 2, 0, Math.PI * 2);
      c.fill();
    }

    const lampPositions = [this.tx - 78, this.tx + TW + 78];
    const glowAlpha = 0.2 + smooth(0.35, 0.9, alt) * 0.65;
    for (const lx of lampPositions) {
      if (lx < 4 || lx > W - 4) continue;
      c.fillStyle = '#1e293b';
      c.fillRect(lx - 1, gy - 26, 2, 26);
      c.beginPath();
      c.roundRect(lx - 2.5, gy - 4, 5, 4, 1);
      c.fill();

      const lg = c.createRadialGradient(lx, gy - 27, 1, lx, gy - 27, 14);
      lg.addColorStop(0, `rgba(254, 240, 138, ${glowAlpha})`);
      lg.addColorStop(1, 'rgba(254, 240, 138, 0)');
      c.fillStyle = lg;
      c.beginPath();
      c.arc(lx, gy - 27, 14, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#fef08a';
      c.beginPath();
      c.arc(lx, gy - 27, 2.2, 0, Math.PI * 2);
      c.fill();
    }
  }

  drawHalalCarts(c, alt) {
    const gy = this.sy(0, 1);
    if (gy >= this.H + 10 || gy < -30) return;

    const cartW = 20;
    const cartH = 9;
    const canopyH = 5;

    for (let idx = 0; idx < this.carts.length; idx++) {
      const cart = this.carts[idx];
      const cx = Math.round(cart.x);
      if (cx < -24 || cx > this.W + 24) continue;

      const baseY = gy - 2;
      const bodyY = baseY - cartH - 2;

      c.fillStyle = 'rgba(0, 0, 0, 0.28)';
      c.beginPath();
      c.roundRect(cx + 1, baseY - 1, cartW, 2.5, 1);
      c.fill();

      c.fillStyle = '#1e293b';
      c.beginPath();
      c.arc(cx + 4, baseY - 1.5, 2, 0, Math.PI * 2);
      c.arc(cx + cartW - 4, baseY - 1.5, 2, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#cbd5e1';
      c.beginPath();
      c.roundRect(cx, bodyY, cartW, cartH, 1.5);
      c.fill();

      c.fillStyle = '#1e293b';
      c.fillRect(cx + 2, bodyY + 1.5, cartW - 4, 3.5);
      c.fillStyle = 'rgba(254, 240, 138, 0.55)';
      c.fillRect(cx + 3, bodyY + 2, cartW - 6, 2.5);

      c.fillStyle = cart.trim;
      c.fillRect(cx + 1.5, bodyY + 5.8, cartW - 3, 2.2);
      c.fillStyle = '#ffffff';
      c.font = '700 2.4px "Plus Jakarta Sans", Inter, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('HALAL', cx + cartW / 2, bodyY + 7);

      const awnY = bodyY - canopyH;
      c.fillStyle = cart.accent;
      c.beginPath();
      c.roundRect(cx - 1, awnY, cartW + 2, canopyH, [2, 2, 0, 0]);
      c.fill();

      c.fillStyle = cart.trim;
      for (let sx = cx; sx < cx + cartW - 1; sx += 4) {
        c.fillRect(sx, awnY, 2, canopyH);
      }

      for (let p = 0; p < 3; p++) {
        const cycle = (this.t * 0.45 + idx * 0.5 + p * 0.33) % 1;
        const px = cx + 6 + p * 4 + Math.sin(this.t * 2.5 + p) * 1.4;
        const py = awnY - 2 - cycle * 11;
        const alpha = (1 - cycle) * (0.28 - smooth(0.5, 1, alt) * 0.08);
        if (alpha > 0.02) {
          c.fillStyle = `rgba(248, 250, 252, ${alpha})`;
          c.beginPath();
          c.arc(px, py, 1.6 + cycle * 1.8, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }

  drawPedestrians(c) {
    const gy = this.sy(0, 1);
    if (gy >= this.H + 10 || gy < -30) return;

    const span = this.W + 60;
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      const raw = (p.offset + this.t * p.speed * p.dir) % span;
      const x = (raw < 0 ? raw + span : raw) - 30;
      const stride = Math.sin(this.t * (0.65 * p.speed) + p.phase);
      const bob = Math.abs(stride) * 1.05;
      const groundLine = gy - 2 + p.depth;
      const baseY = groundLine - bob;

      c.fillStyle = 'rgba(0, 0, 0, 0.22)';
      c.beginPath();
      c.ellipse(x, groundLine + 0.8, 3.1, 1.0, 0, 0, Math.PI * 2);
      c.fill();

      c.strokeStyle = p.pants;
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(x - 0.8, baseY - 4.5);
      c.lineTo(x - 0.8 + stride * 2.2, baseY);
      c.moveTo(x + 0.8, baseY - 4.5);
      c.lineTo(x + 0.8 - stride * 2.2, baseY);
      c.stroke();

      if (p.longHair) {
        c.fillStyle = '#1e1b18';
        c.beginPath();
        c.roundRect(x - 2.4, baseY - 12.2, 4.8, 4.5, 2);
        c.fill();
      }

      c.fillStyle = p.coat;
      c.beginPath();
      c.roundRect(x - 2.3, baseY - 9.2, 4.6, 5, 1.5);
      c.fill();

      if (p.briefcase) {
        c.fillStyle = '#451a03';
        c.beginPath();
        c.roundRect(x + p.dir * 2.1 - 1.4, baseY - 5.2, 2.8, 2.1, 0.6);
        c.fill();
      }

      c.fillStyle = p.skin;
      c.beginPath();
      c.arc(x, baseY - 11.4, 2.1, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#1e1b18';
      c.beginPath();
      c.arc(x, baseY - 11.8, 2.15, Math.PI, Math.PI * 2);
      c.fill();
    }
  }

  drawTower(c, alt) {
    const { tx } = this;
    const top = Math.max(0, this.sy(TOP));
    const bot = Math.min(this.H, this.sy(0));
    if (bot <= top) return;

    const frameCol = colorAt('tower', alt);
    const glassCol = colorAt('glass', alt);
    const on = colorAt('winOn', alt);
    const off = colorAt('winOff', alt);
    const lit = this.litProb(alt);

    c.fillStyle = frameCol;
    c.beginPath();
    c.roundRect(tx, top, TW, bot - top, [4, 4, 0, 0]);
    c.fill();

    const bayW = 24;
    const bayOffsets = [6, 36, 66];
    for (const bx of bayOffsets) {
      c.fillStyle = glassCol;
      c.fillRect(tx + bx, top + 6, bayW, bot - top - 6);
    }

    c.fillStyle = 'rgba(255, 255, 255, 0.10)';
    c.fillRect(tx, top, 1.5, bot - top);
    c.fillRect(tx + 33, top + 4, 1, bot - top - 4);
    c.fillRect(tx + 63, top + 4, 1, bot - top - 4);
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    c.fillRect(tx + TW - 2, top, 2, bot - top);

    const j0 = Math.max(5, Math.floor((this.camY + this.groundY - bot) / 10) - 1);
    const j1 = Math.min(Math.floor(TOP / 10) - 1, Math.ceil((this.camY + this.groundY - top) / 10) + 1);
    for (let j = j0; j <= j1; j++) {
      const y = this.sy(j * 10) - 6;
      if (y < top + 4 || y > bot - 6) continue;

      c.fillStyle = frameCol;
      c.fillRect(tx + 4, y + 6, TW - 8, 2);

      for (let b = 0; b < 3; b++) {
        for (let w = 0; w < 3; w++) {
          const wx = tx + bayOffsets[b] + 2 + w * 7;
          const isOn = hash(b * 3 + w, j, 99) < lit;
          c.fillStyle = isOn ? on : off;
          c.globalAlpha = isOn ? 0.88 : 0.42;
          c.fillRect(wx, y, 5, 5);
        }
      }
    }
    c.globalAlpha = 1;
  }

  drawLobbyEntrance(c, alt) {
    const { H, tx } = this;
    const gy = this.sy(0);
    const lobbyTop = this.sy(48);
    if (lobbyTop >= H || gy <= 0) return;

    const frameCol = colorAt('tower', alt);

    c.fillStyle = frameCol;
    c.fillRect(tx, lobbyTop, TW, gy - lobbyTop);

    const lobbyGrad = c.createLinearGradient(0, lobbyTop, 0, gy);
    lobbyGrad.addColorStop(0, '#334155');
    lobbyGrad.addColorStop(0.55, '#475569');
    lobbyGrad.addColorStop(1, '#785a32');
    c.fillStyle = lobbyGrad;
    c.fillRect(tx + 5, lobbyTop + 4, TW - 10, gy - lobbyTop - 4);

    c.fillStyle = frameCol;
    for (const mx of [tx + 24, tx + 48, tx + 72]) {
      c.fillRect(mx, lobbyTop + 4, 2, gy - lobbyTop - 4);
    }
    c.fillRect(tx + 5, lobbyTop + 20, TW - 10, 2);

    const lampXs = [tx + 15, tx + 36, tx + 60, tx + 81];
    for (const lx of lampXs) {
      c.strokeStyle = 'rgba(15, 23, 42, 0.7)';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(lx, lobbyTop + 22);
      c.lineTo(lx, lobbyTop + 27);
      c.stroke();

      const pg = c.createRadialGradient(lx, lobbyTop + 28, 0.5, lx, lobbyTop + 28, 6);
      pg.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      pg.addColorStop(1, 'rgba(254, 240, 138, 0)');
      c.fillStyle = pg;
      c.beginPath();
      c.arc(lx, lobbyTop + 28, 6, 0, Math.PI * 2);
      c.fill();
    }

    const doorW = 18;
    const doorH = 18;
    const doorY = gy - doorH;
    for (const dx of [tx + 27, tx + 51]) {
      c.fillStyle = 'rgba(226, 232, 240, 0.25)';
      c.beginPath();
      c.roundRect(dx, doorY, doorW, doorH, [3, 3, 0, 0]);
      c.fill();

      c.strokeStyle = '#cbd5e1';
      c.lineWidth = 1.2;
      c.beginPath();
      c.roundRect(dx, doorY, doorW, doorH, [3, 3, 0, 0]);
      c.moveTo(dx + doorW / 2, doorY);
      c.lineTo(dx + doorW / 2, gy);
      c.stroke();

      c.strokeStyle = 'rgba(248, 250, 252, 0.75)';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(dx + 2, doorY + doorH * 0.55);
      c.lineTo(dx + doorW - 2, doorY + doorH * 0.55);
      c.stroke();
    }

    c.fillStyle = '#e2e8f0';
    c.font = '600 5px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('1585', tx + 14, gy - 8);

    const signW = TW - 14;
    const signH = 10;
    const signX = tx + 7;
    const signY = lobbyTop + 11;

    c.fillStyle = '#0f172a';
    c.beginPath();
    c.roundRect(signX, signY, signW, signH, 2);
    c.fill();

    c.strokeStyle = '#94a3b8';
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(signX, signY, signW, signH, 2);
    c.stroke();

    c.fillStyle = '#f8fafc';
    c.font = '700 6.5px "Plus Jakarta Sans", Inter, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('UPTICK', tx + TW / 2, signY + signH / 2 + 0.3);
  }

  drawRoof(c, alt) {
    const { H, tx } = this;
    const y = this.sy(TOP);
    if (y > H + 20 || y < -40) return;

    c.fillStyle = colorAt('tower', alt);
    c.beginPath();
    c.roundRect(tx - 6, y - 5, TW + 12, 6, 2);
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.22)';
    c.fillRect(tx - 6, y - 5, TW + 12, 1.2);

    c.fillStyle = '#fbbf24';
    const hx = tx + TW / 2 - 6;
    c.fillRect(hx, y - 13, 1.8, 8);
    c.fillRect(hx + 10, y - 13, 1.8, 8);
    c.fillRect(hx, y - 9.8, 11.8, 1.8);

    c.fillStyle = colorAt('tower', alt);
    c.fillRect(tx + 10, y - 34, 1.8, 29);
    if (Math.floor(this.t * 1.5) % 2 === 0) {
      const bg = c.createRadialGradient(tx + 10.9, y - 35.5, 0.5, tx + 10.9, y - 35.5, 7);
      bg.addColorStop(0, 'rgba(244, 63, 94, 0.95)');
      bg.addColorStop(1, 'rgba(244, 63, 94, 0)');
      c.fillStyle = bg;
      c.beginPath();
      c.arc(tx + 10.9, y - 35.5, 7, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#f43f5e';
      c.beginPath();
      c.arc(tx + 10.9, y - 35.5, 2, 0, Math.PI * 2);
      c.fill();
    }
  }

  skinColor() { return SKINS[this.look.skin] || SKINS[0]; }

  drawCharacter(c, x, y) {
    const cx = x + 5;
    const skin = this.skinColor();
    const hair = '#1e1b18';
    const shirt = '#f8fafc';
    const pants = '#334155';

    if (this.look.hair === 1) {
      c.fillStyle = hair;
      c.beginPath();
      c.roundRect(cx - 4.2, y + 1.5, 8.4, 7.5, 3.5);
      c.fill();
    }

    c.fillStyle = pants;
    c.beginPath();
    c.roundRect(cx - 2.6, y + 10, 2.1, 4.5, 1);
    c.roundRect(cx + 0.5, y + 10, 2.1, 4.5, 1);
    c.fill();

    c.fillStyle = '#0f172a';
    c.beginPath();
    c.roundRect(cx - 3, y + 13.5, 2.6, 1.8, 0.9);
    c.roundRect(cx + 0.4, y + 13.5, 2.6, 1.8, 0.9);
    c.fill();

    c.fillStyle = shirt;
    c.beginPath();
    c.roundRect(cx - 3.4, y + 6.2, 6.8, 4.6, 2);
    c.fill();

    c.fillStyle = skin;
    c.beginPath();
    c.roundRect(cx - 4.6, y + 6.6, 1.5, 3.8, 0.75);
    c.roundRect(cx + 3.1, y + 6.6, 1.5, 3.8, 0.75);
    c.fill();

    c.fillStyle = skin;
    c.beginPath();
    c.arc(cx, y + 3.6, 3.1, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = hair;
    c.beginPath();
    c.arc(cx, y + 3.1, 3.2, Math.PI * 0.95, Math.PI * 2.05);
    c.fill();

    c.fillStyle = '#0f172a';
    c.beginPath();
    c.arc(cx - 1.1, y + 3.8, 0.65, 0, Math.PI * 2);
    c.arc(cx + 1.1, y + 3.8, 0.65, 0, Math.PI * 2);
    c.fill();
  }

  drawCabin(c) {
    const cx = this.tx + TW / 2 - 10;
    const climbLift = smooth(0, 0.14, this.alt) * (this.groundY - Math.round(this.H * 0.52));
    const onRoof = this.roofArrived && this.alt >= 0.995;
    const cy = onRoof ? this.sy(TOP) - 34 : this.groundY - 32 - climbLift;
    const heliTakesHer = this.heli && this.heli.t > 0.4;

    c.fillStyle = 'rgba(203, 213, 225, 0.55)';
    c.fillRect(cx + 10, 0, 1, cy);

    c.fillStyle = 'rgba(226, 232, 240, 0.20)';
    c.beginPath();
    c.roundRect(cx, cy, 20, 32, 4);
    c.fill();

    c.strokeStyle = 'rgba(248, 250, 252, 0.75)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(cx + 0.5, cy + 0.5, 19, 31, 3.5);
    c.stroke();

    if (!heliTakesHer) {
      const bob = this.moving ? Math.sin(this.t * 14) * 1.1 : 0;
      this.drawCharacter(c, cx + 5, cy + 12 + bob);
    }
  }

  drawHeli(c) {
    const t = this.heli.t;
    const roofY = this.sy(TOP);
    const hx = this.tx + TW / 2;
    let x, y;
    if (t < 0.35) { const k = t / 0.35; x = lerp(this.W + 60, hx, 1 - Math.pow(1 - k, 3)); y = roofY - 50; }
    else if (t < 0.5) { x = hx; y = roofY - 50 + Math.sin(this.t * 6) * 1; }
    else { const k = (t - 0.5) / 0.5; x = lerp(hx, -80, k * k); y = lerp(roofY - 50, roofY - 150, k); }

    c.fillStyle = '#e11d48';
    c.beginPath();
    c.roundRect(x + 14, y + 3.5, 22, 3.5, 1.75);
    c.fill();

    c.fillStyle = '#be123c';
    c.beginPath();
    c.roundRect(x + 33, y - 1.5, 3.5, 8, 1.5);
    c.fill();

    c.fillStyle = '#f43f5e';
    c.beginPath();
    c.roundRect(x - 16, y, 32, 12, 5);
    c.fill();

    c.fillStyle = 'rgba(186, 230, 253, 0.85)';
    c.beginPath();
    c.roundRect(x - 13, y + 2, 12, 6, 3);
    c.fill();

    c.strokeStyle = '#334155';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x - 14, y + 15.5);
    c.lineTo(x + 14, y + 15.5);
    c.moveTo(x - 7, y + 12);
    c.lineTo(x - 7, y + 15.5);
    c.moveTo(x + 7, y + 12);
    c.lineTo(x + 7, y + 15.5);
    c.stroke();

    c.fillStyle = '#334155';
    c.fillRect(x - 0.75, y - 3.5, 1.5, 3.5);
    const w = 22 + Math.sin(this.t * 36) * 16;
    c.strokeStyle = 'rgba(248, 250, 252, 0.8)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - w, y - 4);
    c.lineTo(x + w, y - 4);
    c.stroke();

    if (t > 0.5) this.drawCharacter(c, x - 6, y - 4);
  }
}