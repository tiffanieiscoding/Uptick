const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function scoreDate(guess, target, precise, tol) {
  const err = Math.abs(guess - target);
  if (err === 0) return 1;
  if (precise) {
    if (err <= 2) return 0.75;
    if (err <= 5) return 0.45;
    return 0;
  }
  if (err >= tol) return 0;
  return clamp01(1 - Math.pow(err / tol, 1.35));
}

export function scoreNumber(guess, target, precise, tolFactor) {
  if (guess <= 0 || target <= 0) return 0;
  const ratio = Math.max(guess / target, target / guess);
  if (ratio <= 1.02) return 1;
  if (precise) {
    if (ratio <= 1.1) return 0.75;
    if (ratio <= 1.25) return 0.4;
    return 0;
  }
  const logTol = Math.log(tolFactor);
  const d = Math.log(ratio);
  if (d >= logTol) return 0;
  return clamp01(1 - Math.pow(d / logTol, 1.35));
}

const norm = (s) => s
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\b(the|a|an|le|la|les|l|de|du|des)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function scoreName(guess, accepted) {
  const g = norm(guess);
  if (!g) return 0;
  for (const raw of accepted) {
    const a = norm(raw);
    if (!a) continue;
    if (g === a) return 1;
    if (a.length >= 4 && (g.includes(a) || a.includes(g))) return 0.85;
  }
  return 0;
}