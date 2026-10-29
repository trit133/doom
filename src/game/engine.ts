import { buildAssets, type Assets, type Img, TEX } from './assets';
import { LEVEL } from './map';
import type { Sound, SoundName } from './audio';

// Internal render resolution. Height is fixed; width follows the screen's aspect ratio
// (16:10 on desktop, wider on phones — see Game.resize). The canvas is CSS-scaled up
// with pixelated filtering. Only one Game runs at a time, so a module-level width is fine.
const H = 250;
const BASE_W = 400;
let W = BASE_W;

const EMPTY = 0, BRICK = 1, TECH = 2, STONE = 3, DOOR = 4, EXIT = 5;
const PLAYER_RADIUS = 0.25;
const USE_RANGE = 1.6;

export type Status = 'playing' | 'dead' | 'won';

export interface HudState {
  health: number;
  armor: number;
  bullets: number;
  shells: number;
  weapon: number;
  hasShotgun: boolean;
  kills: number;
  totalKills: number;
  items: number;
  totalItems: number;
  message: string;
  status: Status;
  time: number;
}

export interface GameCallbacks {
  onHud(hud: HudState): void;
  onPauseChange(paused: boolean): void;
}

type MonsterKind = 'imp' | 'demon';
type MonsterState = 'idle' | 'chase' | 'attack' | 'pain' | 'dead';
type ItemKind = keyof Assets['items'];

interface Monster {
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
  state: MonsterState;
  t: number; // time left in current timed state
  cooldown: number; // time until next attack allowed
  anim: number;
  attacked: boolean; // whether this attack has already dealt its hit
}
interface Item { kind: ItemKind; x: number; y: number; taken: boolean }
interface Projectile { x: number; y: number; dx: number; dy: number; life: number }
interface Effect { kind: 'puff' | 'blood'; x: number; y: number; t: number }
interface Door { open: number; dir: -1 | 0 | 1; timer: number }
interface RayHit { dist: number; u: number; tex: number; side: number; cell: number }
interface Sprite { x: number; y: number; img: Img; scale: number; lift: number; bright: boolean; d: number }

const MONSTERS: Record<MonsterKind, { hp: number; speed: number; radius: number; painChance: number; alert: SoundName }> = {
  imp: { hp: 60, speed: 1.6, radius: 0.3, painChance: 0.6, alert: 'impAlert' },
  demon: { hp: 150, speed: 2.9, radius: 0.35, painChance: 0.3, alert: 'demonAlert' },
};

const WEAPONS = [
  { name: 'PISTOL', cooldown: 0.38, ammo: 'bullets' as const, pellets: 1, spread: 0.015, sound: 'pistol' as const },
  { name: 'SHOTGUN', cooldown: 0.95, ammo: 'shells' as const, pellets: 7, spread: 0.09, sound: 'shotgun' as const },
];

const ITEM_CHARS: Record<string, ItemKind> = { a: 'clip', e: 'shells', h: 'health', r: 'armor', s: 'shotgun' };

const rand = Math.random;
const randInt = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

function shade(c: number, s: number): number {
  return (0xff000000 | (((((c >>> 16) & 255) * s) >> 8) << 16) | (((((c >>> 8) & 255) * s) >> 8) << 8) | (((c & 255) * s) >> 8));
}

function light(dist: number): number {
  const f = 1.25 - dist * 0.075;
  return (f < 0.12 ? 0.12 : f > 1 ? 1 : f) * 256;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private image!: ImageData;
  private buf!: Uint32Array;
  private zbuf!: Float32Array;
  private assets: Assets;

  private mw: number;
  private mh: number;
  private grid: Uint8Array;
  private seen: Uint8Array;
  private flow: Int16Array;
  private flowCell = -1;
  private doors = new Map<number, Door>();

  private px = 0;
  private py = 0;
  private angle = 0;
  private health = 100;
  private armor = 0;
  private bullets = 50;
  private shells = 0;
  private weapon = 0;
  private hasShotgun = false;
  private fireT = 0;
  private switchT = 0;
  private bobPhase = 0;
  private bobAmt = 0;
  private hurtFlash = 0;
  private pickupFlash = 0;

  private monsters: Monster[] = [];
  private items: Item[] = [];
  private projectiles: Projectile[] = [];
  private effects: Effect[] = [];

  private keys = new Set<string>();
  private mouseDX = 0;
  private firing = false;
  private showMap = false;
  private paused = true;
  private status: Status = 'playing';
  private time = 0;
  private message = '';
  private messageT = 0;
  private kills = 0;
  private itemsTaken = 0;
  private lastHudKey = '';
  private raf = 0;
  private last = 0;
  private ray: RayHit = { dist: 0, u: 0, tex: 0, side: 0, cell: 0 };

  // Analog input from on-screen touch controls.
  private touchFwd = 0;
  private touchStrafe = 0;
  private touchTurn = 0;

  /** `touch` mode skips pointer lock (unsupported on iOS); pausing is driven by setPaused(). */
  constructor(private canvas: HTMLCanvasElement, private sound: Sound, private cb: GameCallbacks, private touch = false) {
    this.ctx = canvas.getContext('2d')!;
    this.assets = buildAssets();
    this.resize(BASE_W / H);

    this.mh = LEVEL.length;
    this.mw = LEVEL[0].length;
    this.grid = new Uint8Array(this.mw * this.mh);
    this.seen = new Uint8Array(this.mw * this.mh);
    this.flow = new Int16Array(this.mw * this.mh);
    this.loadLevel();
  }

  private loadLevel() {
    for (let y = 0; y < this.mh; y++) {
      for (let x = 0; x < this.mw; x++) {
        const ch = LEVEL[y][x];
        const idx = y * this.mw + x;
        const cx = x + 0.5, cy = y + 0.5;
        let t = EMPTY;
        if (ch === '#') t = BRICK;
        else if (ch === '%') t = TECH;
        else if (ch === '&') t = STONE;
        else if (ch === 'D') { t = DOOR; this.doors.set(idx, { open: 0, dir: 0, timer: 0 }); }
        else if (ch === 'X') t = EXIT;
        else if (ch === 'P') { this.px = cx; this.py = cy; }
        else if (ch === 'i' || ch === 'd') {
          const kind = ch === 'i' ? 'imp' : 'demon';
          this.monsters.push({ kind, x: cx, y: cy, hp: MONSTERS[kind].hp, state: 'idle', t: 0, cooldown: rand(), anim: rand(), attacked: false });
        } else if (ITEM_CHARS[ch]) this.items.push({ kind: ITEM_CHARS[ch], x: cx, y: cy, taken: false });
        this.grid[idx] = t;
      }
    }
  }

  // ---------------------------------------------------------------- lifecycle

  /** Match the render width to the display's aspect ratio (width / height). */
  resize(aspect: number) {
    const w = Math.round(Math.min(600, Math.max(320, H * aspect)) / 2) * 2;
    if (this.image && w === W) return;
    W = w;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.image.data.buffer);
    this.zbuf = new Float32Array(W);
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.emitHud(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Capture the mouse (desktop) and resume play. Call from a user gesture. */
  lock() {
    this.sound.unlock();
    if (this.status !== 'playing') return;
    if (this.touch) {
      this.setPaused(false);
      return;
    }
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Pointer lock unavailable — keyboard turning still works.
    }
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused && this.status === 'playing') this.update(dt);
    this.render();
    this.emitHud();
    this.raf = requestAnimationFrame(this.frame);
  };

  // ---------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || this.status !== 'playing') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyE' || e.code === 'Space') this.use();
    if (e.code === 'Digit1') this.selectWeapon(0);
    if (e.code === 'Digit2') this.selectWeapon(1);
    if (e.code === 'Tab' || e.code === 'KeyM') this.showMap = !this.showMap;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.firing = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.firing = false;
  };

  private onBlur = () => {
    this.keys.clear();
    this.firing = false;
    this.touchFwd = this.touchStrafe = this.touchTurn = 0;
  };

  private onVisibility = () => {
    if (document.hidden && this.touch) this.setPaused(true);
  };

  // ---------------------------------------------------------------- touch API

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) this.onBlur();
    this.cb.onPauseChange(paused);
  }

  /** Analog stick: forward and strafe in -1..1. */
  setMove(fwd: number, strafe: number) {
    this.touchFwd = fwd;
    this.touchStrafe = strafe;
  }

  /** Turn by an angle in radians (accumulated until the next frame). */
  addTurn(radians: number) {
    if (!this.paused) this.touchTurn += radians;
  }

  setFiring(on: boolean) {
    this.firing = on && !this.paused;
  }

  nextWeapon() {
    if (this.hasShotgun) this.selectWeapon(1 - this.weapon);
  }

  toggleMap() {
    this.showMap = !this.showMap;
  }

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === this.canvas) this.mouseDX += e.movementX;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused) return;
    if (e.button === 0) this.firing = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
  };

  private onWheel = (e: WheelEvent) => {
    // Only two weapons, so either wheel direction just toggles.
    if (!this.paused && this.hasShotgun && e.deltaY !== 0) this.selectWeapon(1 - this.weapon);
  };

  private onLockChange = () => {
    if (!this.touch) this.setPaused(document.pointerLockElement !== this.canvas);
  };

  // ---------------------------------------------------------------- world queries

  private isSolid(x: number, y: number): boolean {
    const mx = Math.floor(x), my = Math.floor(y);
    if (mx < 0 || my < 0 || mx >= this.mw || my >= this.mh) return true;
    const idx = my * this.mw + mx;
    const t = this.grid[idx];
    if (t === EMPTY) return false;
    if (t === DOOR) return this.doors.get(idx)!.open < 0.9;
    return true;
  }

  private canOccupy(x: number, y: number, r: number): boolean {
    return !this.isSolid(x - r, y - r) && !this.isSolid(x + r, y - r) && !this.isSolid(x - r, y + r) && !this.isSolid(x + r, y + r);
  }

  /** DDA ray cast through the grid. Distance is in units of the ray direction length. */
  private castRay(ox: number, oy: number, rdx: number, rdy: number, out: RayHit) {
    let mapX = Math.floor(ox), mapY = Math.floor(oy);
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
    const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stepX: number, stepY: number, sdx: number, sdy: number;
    if (rdx < 0) { stepX = -1; sdx = (ox - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - ox) * ddx; }
    if (rdy < 0) { stepY = -1; sdy = (oy - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - oy) * ddy; }

    for (let i = 0; i < 128; i++) {
      let side: number;
      if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
      if (mapX < 0 || mapY < 0 || mapX >= this.mw || mapY >= this.mh) break;
      const idx = mapY * this.mw + mapX;
      const t = this.grid[idx];
      if (t === EMPTY) continue;

      if (t === DOOR) {
        // Doors are thin slabs recessed to the middle of their tile.
        let dist: number;
        if (side === 0) { dist = sdx - ddx * 0.5; if (dist > sdy) continue; }
        else { dist = sdy - ddy * 0.5; if (dist > sdx) continue; }
        let u = side === 0 ? oy + dist * rdy : ox + dist * rdx;
        u -= Math.floor(u);
        const open = this.doors.get(idx)!.open;
        if (u < open) continue; // ray passes through the open part
        out.dist = dist; out.u = u - open; out.tex = DOOR; out.side = side; out.cell = idx;
        return;
      }

      const dist = side === 0 ? sdx - ddx : sdy - ddy;
      let u = side === 0 ? oy + dist * rdy : ox + dist * rdx;
      u -= Math.floor(u);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) u = 1 - u;
      out.dist = dist; out.u = u; out.tex = t; out.side = side; out.cell = idx;
      return;
    }
    out.dist = 1e9; out.u = 0; out.tex = 0; out.side = 0; out.cell = -1;
  }

  private hasLineOfSight(x: number, y: number): boolean {
    const dx = this.px - x, dy = this.py - y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return true;
    this.castRay(x, y, dx / d, dy / d, this.ray);
    return this.ray.dist > d;
  }

  /** BFS distance field from the player's tile; monsters follow it downhill when they can't see the player. */
  private updateFlow() {
    const cell = Math.floor(this.py) * this.mw + Math.floor(this.px);
    if (cell === this.flowCell) return;
    this.flowCell = cell;
    const flow = this.flow;
    flow.fill(-1);
    const queue = new Int32Array(this.mw * this.mh);
    let head = 0, tail = 0;
    queue[tail++] = cell;
    flow[cell] = 0;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % this.mw, cy = (c / this.mw) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= this.mw || ny >= this.mh) continue;
        const n = ny * this.mw + nx;
        const t = this.grid[n];
        if (flow[n] !== -1 || (t !== EMPTY && t !== DOOR)) continue;
        flow[n] = flow[c] + 1;
        queue[tail++] = n;
      }
    }
  }

  // ---------------------------------------------------------------- simulation

  private update(dt: number) {
    this.time += dt;

    // Turning
    const turnKeys = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    this.angle += this.mouseDX * 0.0025 + turnKeys * 2.6 * dt + this.touchTurn;
    this.mouseDX = 0;
    this.touchTurn = 0;

    // Movement: keyboard and touch stick combined; the stick is analog, pushing it fully runs.
    let fwd = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + this.touchFwd;
    let strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.touchStrafe;
    const mag = Math.hypot(fwd, strafe);
    if (mag > 1) { fwd /= mag; strafe /= mag; }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.touchFwd, this.touchStrafe) > 0.92;
    const speed = (run ? 6 : 3.6) * dt;
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const len = Math.min(1, mag);
    if (len > 0.05) {
      const mx = (ca * fwd - sa * strafe) * speed;
      const my = (sa * fwd + ca * strafe) * speed;
      if (this.playerCanOccupy(this.px + mx, this.py)) this.px += mx;
      if (this.playerCanOccupy(this.px, this.py + my)) this.py += my;
      this.bobPhase += dt * (run ? 14 : 10);
      this.bobAmt = Math.min(1, this.bobAmt + dt * 4);
    } else {
      this.bobAmt = Math.max(0, this.bobAmt - dt * 4);
    }

    // Weapon
    this.fireT -= dt;
    this.switchT = Math.max(0, this.switchT - dt);
    if (this.firing && this.fireT <= 0 && this.switchT <= 0) this.shoot();

    this.updateDoors(dt);
    this.updateFlow();
    this.updatePickups();
    this.updateMonsters(dt);
    this.updateProjectiles(dt);

    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < 0.3);

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.pickupFlash = Math.max(0, this.pickupFlash - dt * 3);
    this.messageT -= dt;
    if (this.messageT <= 0) this.message = '';
  }

  private playerCanOccupy(x: number, y: number): boolean {
    if (!this.canOccupy(x, y, PLAYER_RADIUS)) return false;
    for (const m of this.monsters) {
      if (m.state === 'dead') continue;
      const r = MONSTERS[m.kind].radius + PLAYER_RADIUS;
      const nd = (m.x - x) ** 2 + (m.y - y) ** 2;
      // Allow moving away from a monster we're already overlapping.
      if (nd < r * r && nd < (m.x - this.px) ** 2 + (m.y - this.py) ** 2) return false;
    }
    return true;
  }

  private say(msg: string) {
    this.message = msg;
    this.messageT = 2.5;
  }

  private soundAt(name: SoundName, x: number, y: number) {
    const d = Math.hypot(x - this.px, y - this.py);
    this.sound.play(name, Math.min(1, 3 / (d + 1)));
  }

  use() {
    this.castRay(this.px, this.py, Math.cos(this.angle), Math.sin(this.angle), this.ray);
    if (this.ray.dist > USE_RANGE) return;
    if (this.ray.tex === DOOR) this.openDoor(this.ray.cell, true);
    else if (this.ray.tex === EXIT) this.win();
  }

  private openDoor(cell: number, byPlayer = false) {
    const d = this.doors.get(cell);
    if (!d || d.dir === 1 || (d.open >= 1 && d.dir === 0)) return;
    d.dir = 1;
    const x = (cell % this.mw) + 0.5, y = Math.floor(cell / this.mw) + 0.5;
    if (byPlayer) this.sound.play('door');
    else this.soundAt('door', x, y);
  }

  private doorOccupied(cell: number): boolean {
    const cx = cell % this.mw, cy = Math.floor(cell / this.mw);
    const inCell = (x: number, y: number, r: number) => x + r > cx && x - r < cx + 1 && y + r > cy && y - r < cy + 1;
    if (inCell(this.px, this.py, PLAYER_RADIUS)) return true;
    return this.monsters.some((m) => m.state !== 'dead' && inCell(m.x, m.y, MONSTERS[m.kind].radius));
  }

  private updateDoors(dt: number) {
    for (const [cell, d] of this.doors) {
      if (d.dir === 1) {
        d.open += dt * 1.8;
        if (d.open >= 1) { d.open = 1; d.dir = 0; d.timer = 4; }
      } else if (d.dir === -1) {
        if (this.doorOccupied(cell)) { d.dir = 1; continue; }
        d.open -= dt * 1.8;
        if (d.open <= 0) { d.open = 0; d.dir = 0; }
      } else if (d.open >= 1) {
        d.timer -= dt;
        if (d.timer <= 0) {
          if (this.doorOccupied(cell)) d.timer = 1;
          else { d.dir = -1; this.soundAt('door', (cell % this.mw) + 0.5, Math.floor(cell / this.mw) + 0.5); }
        }
      }
    }
  }

  private selectWeapon(w: number) {
    if (w === this.weapon || (w === 1 && !this.hasShotgun)) return;
    this.weapon = w;
    this.switchT = 0.3;
    this.fireT = 0;
  }

  private shoot() {
    const w = WEAPONS[this.weapon];
    if (this[w.ammo] <= 0) {
      this.sound.play('empty');
      this.fireT = 0.4;
      const other = this.weapon === 0 ? 1 : 0;
      if (other === 1 ? this.hasShotgun && this.shells > 0 : this.bullets > 0) this.selectWeapon(other);
      return;
    }
    this[w.ammo]--;
    this.fireT = w.cooldown;
    this.sound.play(w.sound);

    for (let p = 0; p < w.pellets; p++) {
      this.hitscan(this.angle + (rand() - 0.5) * 2 * w.spread, 5 * randInt(1, 3));
    }

    // Gunfire wakes up monsters that can hear it (by path distance).
    for (const m of this.monsters) {
      if (m.state !== 'idle') continue;
      const f = this.flow[Math.floor(m.y) * this.mw + Math.floor(m.x)];
      if (f >= 0 && f <= 9) this.alert(m);
    }
  }

  private hitscan(a: number, dmg: number) {
    const ca = Math.cos(a), sa = Math.sin(a);
    this.castRay(this.px, this.py, ca, sa, this.ray);
    const wall = this.ray.dist;
    let best: Monster | null = null;
    let bestAlong = wall;
    for (const m of this.monsters) {
      if (m.state === 'dead') continue;
      const dx = m.x - this.px, dy = m.y - this.py;
      const along = dx * ca + dy * sa;
      if (along <= 0 || along >= bestAlong) continue;
      const perp = Math.abs(-dx * sa + dy * ca);
      if (perp < MONSTERS[m.kind].radius) { best = m; bestAlong = along; }
    }
    if (best) {
      this.effects.push({ kind: 'blood', x: this.px + ca * (bestAlong - 0.3), y: this.py + sa * (bestAlong - 0.3), t: 0 });
      this.damageMonster(best, dmg);
    } else if (wall < 1e8) {
      this.effects.push({ kind: 'puff', x: this.px + ca * (wall - 0.05), y: this.py + sa * (wall - 0.05), t: 0 });
    }
  }

  private alert(m: Monster) {
    if (m.state !== 'idle') return;
    m.state = 'chase';
    m.cooldown = Math.max(m.cooldown, 0.8 + rand() * 0.8); // reaction time before first attack
    this.soundAt(MONSTERS[m.kind].alert, m.x, m.y);
  }

  private damageMonster(m: Monster, dmg: number) {
    m.hp -= dmg;
    if (m.hp <= 0) {
      m.state = 'dead';
      this.kills++;
      this.soundAt('monsterDie', m.x, m.y);
      return;
    }
    if (m.state === 'idle') this.alert(m);
    if (rand() < MONSTERS[m.kind].painChance) {
      m.state = 'pain';
      m.t = 0.22;
      this.soundAt('monsterPain', m.x, m.y);
    }
  }

  private damagePlayer(amount: number) {
    if (this.status !== 'playing') return;
    const saved = Math.min(this.armor, Math.floor(amount / 3));
    this.armor -= saved;
    this.health -= amount - saved;
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / 25);
    if (this.health <= 0) {
      this.health = 0;
      this.status = 'dead';
      this.sound.play('death');
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } else {
      this.sound.play('hurt');
    }
  }

  private win() {
    this.status = 'won';
    this.sound.play('exit');
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private updatePickups() {
    for (const it of this.items) {
      if (it.taken || (it.x - this.px) ** 2 + (it.y - this.py) ** 2 > 0.36) continue;
      let msg = '';
      switch (it.kind) {
        case 'health':
          if (this.health >= 100) continue;
          this.health = Math.min(100, this.health + 25);
          msg = 'Picked up a medikit.';
          break;
        case 'clip':
          if (this.bullets >= 200) continue;
          this.bullets = Math.min(200, this.bullets + 15);
          msg = 'Picked up a clip.';
          break;
        case 'shells':
          if (this.shells >= 50) continue;
          this.shells = Math.min(50, this.shells + 8);
          msg = 'Picked up a box of shells.';
          break;
        case 'armor':
          if (this.armor >= 100) continue;
          this.armor = 100;
          msg = 'Picked up the armor.';
          break;
        case 'shotgun':
          this.shells = Math.min(50, this.shells + 8);
          msg = 'You got the shotgun!';
          if (!this.hasShotgun) {
            this.hasShotgun = true;
            this.weapon = 1;
            this.switchT = 0.3;
          }
          break;
      }
      it.taken = true;
      this.itemsTaken++;
      this.pickupFlash = 1;
      this.sound.play(it.kind === 'shotgun' ? 'weapon' : 'pickup');
      this.say(msg);
    }
  }

  private updateMonsters(dt: number) {
    for (const m of this.monsters) {
      if (m.state === 'dead') continue;
      const def = MONSTERS[m.kind];
      m.anim += dt;
      m.cooldown -= dt;
      m.t -= dt;
      const dx = this.px - m.x, dy = this.py - m.y;
      const dist = Math.hypot(dx, dy);

      switch (m.state) {
        case 'idle':
          if (dist < 16 && this.hasLineOfSight(m.x, m.y)) this.alert(m);
          break;

        case 'pain':
          if (m.t <= 0) m.state = 'chase';
          break;

        case 'attack':
          if (m.kind === 'imp') {
            if (!m.attacked && m.t <= 0.25) {
              m.attacked = true;
              const d = Math.max(dist, 0.01);
              this.projectiles.push({ x: m.x + (dx / d) * 0.4, y: m.y + (dy / d) * 0.4, dx: dx / d, dy: dy / d, life: 6 });
              this.soundAt('fireball', m.x, m.y);
            }
            if (m.t <= 0) { m.state = 'chase'; m.cooldown = 1.8 + rand() * 1.5; }
          } else {
            if (!m.attacked && m.t <= 0.2) {
              m.attacked = true;
              if (dist < 1.4) { this.damagePlayer(randInt(4, 10) * 2); this.soundAt('bite', m.x, m.y); }
            }
            if (m.t <= 0) { m.state = 'chase'; m.cooldown = 0.5; }
          }
          break;

        case 'chase': {
          const sees = this.hasLineOfSight(m.x, m.y);
          if (m.kind === 'imp' && sees && dist < 14 && m.cooldown <= 0) {
            m.state = 'attack'; m.t = 0.6; m.attacked = false;
            break;
          }
          if (m.kind === 'demon' && dist < 1.2 && m.cooldown <= 0) {
            m.state = 'attack'; m.t = 0.45; m.attacked = false;
            break;
          }
          let tx = this.px, ty = this.py;
          if (!sees) {
            const cx = Math.floor(m.x), cy = Math.floor(m.y);
            let best = this.flow[cy * this.mw + cx];
            if (best < 0) best = 1e4;
            let found = false;
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const f = this.flow[(cy + oy) * this.mw + cx + ox];
              if (f >= 0 && f < best) { best = f; tx = cx + ox + 0.5; ty = cy + oy + 0.5; found = true; }
            }
            if (!found) break;
          }
          const minDist = m.kind === 'imp' ? (sees ? 2.5 : 0) : 0.85;
          if (dist < minDist) break;
          const mdx = tx - m.x, mdy = ty - m.y;
          const ml = Math.hypot(mdx, mdy) || 1;
          const step = def.speed * dt;
          const nx = (mdx / ml) * step, ny = (mdy / ml) * step;
          // Monsters open doors in their way.
          const ahead = Math.floor(m.y + (mdy / ml) * 0.6) * this.mw + Math.floor(m.x + (mdx / ml) * 0.6);
          if (this.grid[ahead] === DOOR) this.openDoor(ahead);
          if (this.canOccupy(m.x + nx, m.y, def.radius)) m.x += nx;
          if (this.canOccupy(m.x, m.y + ny, def.radius)) m.y += ny;
          break;
        }
      }
    }

    // Keep live monsters from stacking on top of each other.
    const live = this.monsters.filter((m) => m.state !== 'dead');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const r = MONSTERS[a.kind].radius + MONSTERS[b.kind].radius;
        if (d > 0.001 && d < r) {
          const push = (r - d) / 2 / d;
          if (this.canOccupy(a.x - dx * push, a.y - dy * push, MONSTERS[a.kind].radius)) { a.x -= dx * push; a.y -= dy * push; }
          if (this.canOccupy(b.x + dx * push, b.y + dy * push, MONSTERS[b.kind].radius)) { b.x += dx * push; b.y += dy * push; }
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    const speed = 5.5;
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.dx * speed * dt;
      p.y += p.dy * speed * dt;
      p.life -= dt;
      if ((p.x - this.px) ** 2 + (p.y - this.py) ** 2 < 0.16) {
        this.damagePlayer(randInt(1, 5) * 3);
        this.sound.play('explode', 0.8);
        return false;
      }
      if (this.isSolid(p.x, p.y) || p.life <= 0) {
        this.effects.push({ kind: 'puff', x: p.x - p.dx * 0.1, y: p.y - p.dy * 0.1, t: 0 });
        this.soundAt('explode', p.x, p.y);
        return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------- HUD

  private emitHud(force = false) {
    const hud: HudState = {
      health: Math.ceil(this.health),
      armor: this.armor,
      bullets: this.bullets,
      shells: this.shells,
      weapon: this.weapon,
      hasShotgun: this.hasShotgun,
      kills: this.kills,
      totalKills: this.monsters.length,
      items: this.itemsTaken,
      totalItems: this.items.length,
      message: this.message,
      status: this.status,
      time: Math.floor(this.time),
    };
    const key = JSON.stringify(hud);
    if (force || key !== this.lastHudKey) {
      this.lastHudKey = key;
      this.cb.onHud(hud);
    }
  }

  // ---------------------------------------------------------------- rendering

  private render() {
    const buf = this.buf;
    const dirX = Math.cos(this.angle), dirY = Math.sin(this.angle);
    // Widen the field of view with the screen so proportions stay the same on wide phones.
    const fov = (0.66 * W) / BASE_W;
    const planeX = -dirY * fov, planeY = dirX * fov;
    const half = H / 2;
    // Muzzle flash briefly brightens the world.
    const gunLight = this.fireT > WEAPONS[this.weapon].cooldown - 0.08 ? 1.35 : 1;

    // Floor & ceiling
    const floor = this.assets.floor, ceil = this.assets.ceil;
    const rdx0 = dirX - planeX, rdy0 = dirY - planeY;
    const rdx1 = dirX + planeX, rdy1 = dirY + planeY;
    for (let y = half; y < H; y++) {
      const rowDist = half / (y - half + 0.5);
      const stepX = (rowDist * (rdx1 - rdx0)) / W;
      const stepY = (rowDist * (rdy1 - rdy0)) / W;
      let fx = this.px + rowDist * rdx0;
      let fy = this.py + rowDist * rdy0;
      const s = Math.min(256, light(rowDist) * gunLight) | 0;
      const rowF = y * W, rowC = (H - 1 - y) * W;
      for (let x = 0; x < W; x++) {
        const t = (((fy * TEX) & 63) << 6) | ((fx * TEX) & 63);
        buf[rowF + x] = shade(floor[t], s);
        buf[rowC + x] = shade(ceil[t], s);
        fx += stepX;
        fy += stepY;
      }
    }

    // Walls
    const ray = this.ray;
    for (let x = 0; x < W; x++) {
      const camX = (2 * x) / W - 1;
      this.castRay(this.px, this.py, dirX + planeX * camX, dirY + planeY * camX, ray);
      const dist = Math.max(ray.dist, 0.05);
      this.zbuf[x] = dist;
      if (ray.cell < 0) continue;
      this.seen[ray.cell] = 1;
      const tex = this.assets.walls[ray.tex];
      const lineH = H / dist;
      const top = half - lineH / 2;
      const y0 = Math.max(0, Math.ceil(top));
      const y1 = Math.min(H, Math.ceil(half + lineH / 2));
      const tx = Math.min(TEX - 1, (ray.u * TEX) | 0);
      const step = TEX / lineH;
      let tpos = (y0 - top) * step;
      const s = Math.min(256, light(dist) * (ray.side ? 0.78 : 1) * gunLight) | 0;
      for (let y = y0; y < y1; y++) {
        buf[y * W + x] = shade(tex[((tpos & 63) << 6) | tx], s);
        tpos += step;
      }
    }

    this.renderSprites(dirX, dirY, planeX, planeY, gunLight);
    this.ctx.putImageData(this.image, 0, 0);
    this.renderWeapon();
    this.renderOverlays();
  }

  private renderSprites(dirX: number, dirY: number, planeX: number, planeY: number, gunLight: number) {
    const a = this.assets;
    const sprites: Sprite[] = [];
    const add = (x: number, y: number, img: Img, scale: number, lift = 0, bright = false) =>
      sprites.push({ x, y, img, scale, lift, bright, d: (x - this.px) ** 2 + (y - this.py) ** 2 });

    for (const m of this.monsters) {
      const set = m.kind === 'imp' ? a.imp : a.demon;
      const img =
        m.state === 'dead' ? set.dead
        : m.state === 'pain' ? set.pain
        : m.state === 'attack' ? set.attack
        : m.state === 'chase' ? (Math.floor(m.anim * 5) % 2 ? set.walk1 : set.walk0)
        : set.walk0;
      add(m.x, m.y, img, m.kind === 'imp' ? 0.9 : 0.85);
    }
    for (const it of this.items) if (!it.taken) add(it.x, it.y, a.items[it.kind], 0.5);
    for (const p of this.projectiles) add(p.x, p.y, a.fireball[Math.floor(this.time * 12) % 2], 0.45, 0.28, true);
    for (const e of this.effects) {
      if (e.kind === 'puff') add(e.x, e.y, a.puff[Math.min(2, Math.floor(e.t * 10))], 0.35, 0.33);
      else add(e.x, e.y, a.blood, 0.35, 0.35);
    }
    sprites.sort((p, q) => q.d - p.d);

    const buf = this.buf;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    for (const sp of sprites) {
      const sx = sp.x - this.px, sy = sp.y - this.py;
      const tX = invDet * (dirY * sx - dirX * sy);
      const tY = invDet * (-planeY * sx + planeX * sy);
      if (tY <= 0.15) continue;
      const screenX = (W / 2) * (1 + tX / tY);
      const unit = H / tY;
      const size = unit * sp.scale;
      const bottom = H / 2 + unit * (0.5 - sp.lift);
      const top = bottom - size;
      const left = screenX - size / 2;
      const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(W, Math.ceil(left + size));
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(H, Math.ceil(bottom));
      if (x0 >= x1 || y0 >= y1) continue;
      const s = sp.bright ? 256 : (Math.min(256, light(tY) * gunLight) | 0);
      const step = TEX / size;
      const img = sp.img;
      for (let x = x0; x < x1; x++) {
        if (tY >= this.zbuf[x]) continue;
        const tx = Math.min(TEX - 1, ((x - left) * step) | 0);
        let tpos = (y0 - top) * step;
        for (let y = y0; y < y1; y++) {
          const c = img[(Math.min(TEX - 1, tpos | 0) << 6) | tx];
          tpos += step;
          if (c === 0) continue;
          buf[y * W + x] = s === 256 ? c : shade(c, s);
        }
      }
    }
  }

  private renderWeapon() {
    const ctx = this.ctx;
    const w = WEAPONS[this.weapon];
    const bobX = Math.cos(this.bobPhase) * 6 * this.bobAmt;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 5 * this.bobAmt;
    const sinceFire = w.cooldown - this.fireT;
    const flash = sinceFire >= 0 && sinceFire < 0.07;
    let yOff = bobY + this.switchT * 120;
    if (sinceFire >= 0 && sinceFire < 0.1) yOff += 5;
    if (this.weapon === 1 && sinceFire > 0.25 && sinceFire < w.cooldown - 0.1) {
      yOff += Math.sin(((sinceFire - 0.25) / (w.cooldown - 0.35)) * Math.PI) * 14; // pump
    }
    if (this.status === 'dead') yOff += 80;

    ctx.save();
    ctx.translate(W / 2 + 20 + bobX, H + yOff);
    const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    if (flash) {
      const fy = this.weapon === 0 ? -70 : -92;
      ctx.fillStyle = '#ff9a1a';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const rad = i % 2 ? 7 : 18;
        ctx.lineTo(Math.cos(ang) * rad, fy + Math.sin(ang) * rad);
      }
      ctx.fill();
      ctx.fillStyle = '#fff6a0';
      ctx.beginPath(); ctx.arc(0, fy, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (this.weapon === 0) {
      r(-7, -64, 14, 42, '#4a4a4f');
      r(-4, -62, 3, 38, '#7a7a80');
      r(-7, -64, 14, 3, '#222');
      r(-18, -26, 36, 26, '#c68642');
      r(-24, -18, 9, 18, '#b07535');
      r(-18, -26, 36, 3, '#9a6030');
      r(-10, -14, 4, 14, '#a0682f');
    } else {
      r(-6, -88, 12, 66, '#3c3c40');
      r(-3, -88, 3, 66, '#6a6a70');
      r(-6, -88, 12, 3, '#151515');
      r(-12, -56 + (this.fireT > 0.25 && this.fireT < w.cooldown - 0.25 ? 8 : 0), 24, 16, '#6b4220');
      r(-24, -46, 14, 18, '#c68642');
      r(-14, -26, 30, 26, '#5a3518');
      r(4, -22, 18, 22, '#c68642');
    }
    ctx.restore();
  }

  private renderOverlays() {
    const ctx = this.ctx;
    if (this.status === 'playing' && !this.showMap) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(W / 2 - 3, H / 2, 2, 1);
      ctx.fillRect(W / 2 + 2, H / 2, 2, 1);
      ctx.fillRect(W / 2, H / 2 - 3, 1, 2);
      ctx.fillRect(W / 2, H / 2 + 2, 1, 2);
    }
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${this.hurtFlash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.pickupFlash > 0) {
      ctx.fillStyle = `rgba(255,220,80,${this.pickupFlash * 0.2})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.status === 'dead') {
      ctx.fillStyle = 'rgba(120,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.showMap) this.renderAutomap();
  }

  private renderAutomap() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, W, H);
    const cs = Math.floor(Math.min((W - 20) / this.mw, (H - 20) / this.mh));
    const ox = Math.floor((W - cs * this.mw) / 2), oy = Math.floor((H - cs * this.mh) / 2);
    for (let y = 0; y < this.mh; y++) {
      for (let x = 0; x < this.mw; x++) {
        const idx = y * this.mw + x;
        if (!this.seen[idx]) continue;
        const t = this.grid[idx];
        ctx.fillStyle = t === DOOR ? '#d8c040' : t === EXIT ? '#ff3030' : '#b03a2a';
        ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
      }
    }
    const pxs = ox + this.px * cs, pys = oy + this.py * cs;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pxs + Math.cos(this.angle) * 6, pys + Math.sin(this.angle) * 6);
    ctx.lineTo(pxs + Math.cos(this.angle + 2.5) * 4, pys + Math.sin(this.angle + 2.5) * 4);
    ctx.lineTo(pxs + Math.cos(this.angle - 2.5) * 4, pys + Math.sin(this.angle - 2.5) * 4);
    ctx.closePath();
    ctx.stroke();
  }
}
