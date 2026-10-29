// Procedurally generated textures and sprites. No external art files needed.
// Every image is a TEX x TEX Uint32Array in ABGR (little-endian ImageData) order,
// indexed row-major: pixels[y * TEX + x].

export const TEX = 64;
export type Img = Uint32Array;

export const rgb = (r: number, g: number, b: number): number =>
  ((255 << 24) | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r)) >>> 0;

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeImg(fn: (x: number, y: number) => number): Img {
  const img = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) img[y * TEX + x] = fn(x, y);
  return img;
}

function fromCanvas(draw: (ctx: CanvasRenderingContext2D) => void): Img {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const data = ctx.getImageData(0, 0, TEX, TEX).data;
  const img = new Uint32Array(TEX * TEX);
  for (let i = 0; i < img.length; i++) {
    const a = data[i * 4 + 3];
    // Hard alpha cutoff keeps sprites crisp; 0 means transparent.
    img[i] = a < 128 ? 0 : rgb(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  return img;
}

// ---------- wall / flat textures ----------

function brick(): Img {
  const r = rng(7);
  const noise = Array.from({ length: TEX * TEX }, () => r());
  return makeImg((x, y) => {
    const row = Math.floor(y / 16);
    const bx = (x + (row % 2) * 16) % 32;
    const mortar = y % 16 < 2 || bx < 2;
    const n = noise[y * TEX + x];
    if (mortar) return rgb(60 + n * 20, 55 + n * 15, 50 + n * 10);
    const shade = 0.8 + 0.2 * Math.sin(row * 3.1 + Math.floor((x + (row % 2) * 16) / 32) * 1.7);
    return rgb((130 + n * 40) * shade, (55 + n * 20) * shade, (40 + n * 15) * shade);
  });
}

function tech(): Img {
  const r = rng(11);
  const noise = Array.from({ length: TEX * TEX }, () => r());
  return makeImg((x, y) => {
    const n = noise[y * TEX + x];
    const px = x % 32, py = y % 32;
    if (px === 0 || py === 0) return rgb(30, 30, 35);
    if (px === 31 || py === 31) return rgb(140, 140, 150);
    if ((px === 4 || px === 27) && (py === 4 || py === 27)) return rgb(200, 200, 210);
    if (y >= 28 && y <= 35 && x > 6 && x < 58) {
      const lit = Math.floor(x / 4) % 2 === 0;
      return lit ? rgb(60, 255, 120) : rgb(20, 90, 40);
    }
    const base = 90 + n * 25;
    return rgb(base, base + 3, base + 10);
  });
}

function stone(): Img {
  const r = rng(23);
  const pts = Array.from({ length: 14 }, () => [r() * TEX, r() * TEX, 0.6 + r() * 0.4]);
  const noise = Array.from({ length: TEX * TEX }, () => r());
  return makeImg((x, y) => {
    let d1 = 1e9, d2 = 1e9, shade = 1;
    for (const [px, py, s] of pts) {
      for (let ox = -TEX; ox <= TEX; ox += TEX)
        for (let oy = -TEX; oy <= TEX; oy += TEX) {
          const d = Math.hypot(x - px - ox, y - py - oy);
          if (d < d1) { d2 = d1; d1 = d; shade = s; } else if (d < d2) d2 = d;
        }
    }
    const n = noise[y * TEX + x];
    if (d2 - d1 < 1.6) return rgb(35, 38, 32);
    return rgb((85 + n * 25) * shade, (95 + n * 25) * shade, (80 + n * 20) * shade);
  });
}

function door(): Img {
  const r = rng(5);
  const noise = Array.from({ length: TEX * TEX }, () => r());
  return makeImg((x, y) => {
    const n = noise[y * TEX + x];
    if (x < 3 || x > 60) return rgb(50, 50, 55);
    if (y > 50) {
      const stripe = Math.floor((x + y) / 6) % 2 === 0;
      return stripe ? rgb(220, 180, 20) : rgb(25, 25, 25);
    }
    if (x % 16 === 0) return rgb(60, 60, 70);
    if (y > 20 && y < 26) return rgb(170, 170, 180);
    const b = 105 + n * 20;
    return rgb(b, b - 5, b - 15);
  });
}

function exitSwitch(): Img {
  const base = tech();
  return fromCanvas((ctx) => {
    const id = ctx.createImageData(TEX, TEX);
    new Uint32Array(id.data.buffer).set(base);
    ctx.putImageData(id, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(8, 8, 48, 18);
    ctx.fillStyle = '#ff2a1a';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', 32, 22);
    ctx.fillStyle = '#333';
    ctx.fillRect(24, 38, 16, 18);
    ctx.fillStyle = '#d33';
    ctx.fillRect(28, 42, 8, 10);
  });
}

function floorTex(): Img {
  const r = rng(3);
  const noise = Array.from({ length: TEX * TEX }, () => r());
  return makeImg((x, y) => {
    const n = noise[y * TEX + x];
    if (x % 32 === 0 || y % 32 === 0) return rgb(30, 28, 25);
    const b = 60 + n * 22;
    return rgb(b + 8, b, b - 8);
  });
}

function ceilTex(): Img {
  const r = rng(9);
  const noise = Array.from({ length: TEX * TEX }, () => r());
  return makeImg((x, y) => {
    const n = noise[y * TEX + x];
    const dx = x - 32, dy = y - 32;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const edge = Math.abs(dx) > 8 || Math.abs(dy) > 8;
      return edge ? rgb(90, 90, 90) : rgb(255, 250, 220);
    }
    const b = 45 + n * 15;
    return rgb(b, b, b + 4);
  });
}

// ---------- sprites ----------

type Pose = 'walk0' | 'walk1' | 'attack' | 'pain' | 'dead';

function drawImp(ctx: CanvasRenderingContext2D, pose: Pose) {
  const skin = pose === 'pain' ? '#c9805a' : '#8a5a3a';
  const dark = '#5a3520';
  if (pose === 'dead') {
    ctx.fillStyle = '#7a1010';
    ctx.beginPath(); ctx.ellipse(32, 58, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(30, 55, 18, 6, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(46, 54, 6, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const step = pose === 'walk1' ? 3 : pose === 'walk0' ? -3 : 0;
  // legs
  ctx.fillStyle = dark;
  ctx.fillRect(22 + step, 44, 7, 20);
  ctx.fillRect(35 - step, 44, 7, 20);
  // body
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(32, 34, 13, 15, 0, 0, Math.PI * 2); ctx.fill();
  // spikes
  ctx.fillStyle = '#ddd';
  for (const sx of [22, 28, 36, 42]) {
    ctx.beginPath(); ctx.moveTo(sx, 24); ctx.lineTo(sx + 2, 18); ctx.lineTo(sx + 4, 24); ctx.fill();
  }
  // arms
  ctx.fillStyle = skin;
  if (pose === 'attack') {
    ctx.fillRect(14, 10, 6, 22);
    ctx.fillRect(44, 10, 6, 22);
    ctx.fillStyle = '#ff8a00';
    ctx.beginPath(); ctx.arc(32, 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffee66';
    ctx.beginPath(); ctx.arc(32, 8, 3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillRect(15, 28 - step, 6, 18);
    ctx.fillRect(43, 28 + step, 6, 18);
  }
  // head
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(32, 17, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(27, 15, 3, 3);
  ctx.fillRect(34, 15, 3, 3);
  ctx.fillStyle = '#300';
  ctx.fillRect(28, 21, 8, 2);
}

function drawDemon(ctx: CanvasRenderingContext2D, pose: Pose) {
  const skin = pose === 'pain' ? '#ff9ab0' : '#d4607a';
  const dark = '#8a3048';
  if (pose === 'dead') {
    ctx.fillStyle = '#7a1010';
    ctx.beginPath(); ctx.ellipse(32, 58, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(32, 54, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const step = pose === 'walk1' ? 4 : pose === 'walk0' ? -4 : 0;
  ctx.fillStyle = dark;
  ctx.fillRect(14 + step, 46, 10, 18);
  ctx.fillRect(40 - step, 46, 10, 18);
  // hunched body
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(32, 38, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark;
  ctx.fillRect(18, 42, 28, 3);
  // head with jaw
  const open = pose === 'attack' ? 10 : 3;
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(32, 24, 15, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#400';
  ctx.fillRect(21, 26, 22, open);
  ctx.fillStyle = '#fff';
  for (let tx = 22; tx < 42; tx += 4) {
    ctx.beginPath(); ctx.moveTo(tx, 26); ctx.lineTo(tx + 2, 30); ctx.lineTo(tx + 4, 26); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx, 26 + open); ctx.lineTo(tx + 2, 22 + open); ctx.lineTo(tx + 4, 26 + open); ctx.fill();
  }
  ctx.fillStyle = '#ffdd00';
  ctx.fillRect(24, 17, 4, 3);
  ctx.fillRect(36, 17, 4, 3);
  // horns
  ctx.fillStyle = '#eee';
  ctx.beginPath(); ctx.moveTo(19, 18); ctx.lineTo(14, 8); ctx.lineTo(23, 15); ctx.fill();
  ctx.beginPath(); ctx.moveTo(45, 18); ctx.lineTo(50, 8); ctx.lineTo(41, 15); ctx.fill();
}

function fireball(frame: number): Img {
  return fromCanvas((ctx) => {
    const r = frame ? 13 : 11;
    ctx.fillStyle = '#ff3300';
    ctx.beginPath(); ctx.arc(32, 32, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9900';
    ctx.beginPath(); ctx.arc(32, 32, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffff99';
    ctx.beginPath(); ctx.arc(32 + (frame ? 2 : -2), 31, r / 2, 0, Math.PI * 2); ctx.fill();
  });
}

function puff(frame: number): Img {
  return fromCanvas((ctx) => {
    const r = 4 + frame * 4;
    ctx.fillStyle = frame === 2 ? '#666' : '#bbb';
    ctx.beginPath(); ctx.arc(32, 32, r, 0, Math.PI * 2); ctx.fill();
    if (frame === 0) {
      ctx.fillStyle = '#ffdd66';
      ctx.beginPath(); ctx.arc(32, 32, 2, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function blood(): Img {
  return fromCanvas((ctx) => {
    ctx.fillStyle = '#b00';
    for (const [x, y, r] of [[32, 32, 6], [26, 28, 3], [38, 36, 4], [30, 39, 3]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function medkit(): Img {
  return fromCanvas((ctx) => {
    ctx.fillStyle = '#eee'; ctx.fillRect(14, 40, 36, 24);
    ctx.fillStyle = '#aaa'; ctx.fillRect(14, 60, 36, 4);
    ctx.fillStyle = '#d00'; ctx.fillRect(28, 43, 8, 18); ctx.fillRect(23, 48, 18, 8);
  });
}

function clip(): Img {
  return fromCanvas((ctx) => {
    ctx.fillStyle = '#665'; ctx.fillRect(22, 48, 20, 16);
    ctx.fillStyle = '#cc9'; for (let i = 0; i < 4; i++) ctx.fillRect(24 + i * 5, 42, 3, 8);
    ctx.fillStyle = '#ffd040'; for (let i = 0; i < 4; i++) ctx.fillRect(24 + i * 5, 40, 3, 3);
  });
}

function shells(): Img {
  return fromCanvas((ctx) => {
    ctx.fillStyle = '#6a4020'; ctx.fillRect(16, 50, 32, 14);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#c22'; ctx.fillRect(18 + i * 6, 38, 5, 13);
      ctx.fillStyle = '#d9b040'; ctx.fillRect(18 + i * 6, 47, 5, 4);
    }
  });
}

function shotgunPickup(): Img {
  return fromCanvas((ctx) => {
    ctx.fillStyle = '#333'; ctx.fillRect(6, 52, 40, 4);
    ctx.fillStyle = '#222'; ctx.fillRect(6, 56, 34, 3);
    ctx.fillStyle = '#6b4220'; ctx.fillRect(40, 52, 18, 8);
    ctx.fillRect(28, 56, 10, 4);
  });
}

function armor(): Img {
  return fromCanvas((ctx) => {
    ctx.fillStyle = '#2a8a2a';
    ctx.beginPath();
    ctx.moveTo(18, 36); ctx.lineTo(26, 32); ctx.lineTo(32, 36); ctx.lineTo(38, 32); ctx.lineTo(46, 36);
    ctx.lineTo(44, 64); ctx.lineTo(20, 64); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a5a1a'; ctx.fillRect(30, 38, 4, 24);
    ctx.fillStyle = '#5c5'; ctx.fillRect(22, 44, 6, 6); ctx.fillRect(36, 44, 6, 6);
  });
}

const poses: Pose[] = ['walk0', 'walk1', 'attack', 'pain', 'dead'];

export interface Assets {
  walls: Img[]; // index by wall id (1 brick, 2 tech, 3 stone, 4 door, 5 exit)
  floor: Img;
  ceil: Img;
  imp: Record<Pose, Img>;
  demon: Record<Pose, Img>;
  fireball: Img[];
  puff: Img[];
  blood: Img;
  items: Record<'health' | 'clip' | 'shells' | 'shotgun' | 'armor', Img>;
}

export function buildAssets(): Assets {
  const sprite = (draw: (ctx: CanvasRenderingContext2D, p: Pose) => void) =>
    Object.fromEntries(poses.map((p) => [p, fromCanvas((ctx) => draw(ctx, p))])) as Record<Pose, Img>;
  return {
    walls: [new Uint32Array(0), brick(), tech(), stone(), door(), exitSwitch()],
    floor: floorTex(),
    ceil: ceilTex(),
    imp: sprite(drawImp),
    demon: sprite(drawDemon),
    fireball: [fireball(0), fireball(1)],
    puff: [puff(0), puff(1), puff(2)],
    blood: blood(),
    items: { health: medkit(), clip: clip(), shells: shells(), shotgun: shotgunPickup(), armor: armor() },
  };
}
