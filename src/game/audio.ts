// Tiny Web Audio synth for sound effects — everything is generated at runtime.

export type SoundName =
  | 'pistol' | 'shotgun' | 'empty' | 'pickup' | 'weapon' | 'door' | 'hurt' | 'death'
  | 'impAlert' | 'demonAlert' | 'fireball' | 'explode' | 'bite' | 'monsterPain' | 'monsterDie' | 'exit';

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;

  /** Must be called from a user gesture (click/keypress) so browsers allow audio. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private noise(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass', vol = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, vol = 1, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  /** vol lets distant sounds play quieter (0..1). */
  play(name: SoundName, vol = 1) {
    if (!this.ctx || vol <= 0.02) return;
    switch (name) {
      case 'pistol':
        this.noise(0.18, 2500, 0.9, 'lowpass', vol);
        this.tone('square', 180, 60, 0.08, 0.3, vol);
        break;
      case 'shotgun':
        this.noise(0.45, 1200, 1.2, 'lowpass', vol);
        this.tone('sawtooth', 120, 40, 0.2, 0.5, vol);
        this.noise(0.12, 400, 0.4, 'bandpass', vol * 0.6);
        break;
      case 'empty':
        this.tone('square', 900, 700, 0.04, 0.15, vol);
        break;
      case 'pickup':
        this.tone('square', 600, 600, 0.06, 0.2, vol);
        this.tone('square', 900, 900, 0.08, 0.2, vol, 0.06);
        break;
      case 'weapon':
        this.tone('square', 300, 300, 0.06, 0.25, vol);
        this.tone('square', 450, 450, 0.06, 0.25, vol, 0.07);
        this.tone('square', 700, 700, 0.1, 0.25, vol, 0.14);
        break;
      case 'door':
        this.noise(0.7, 300, 0.6, 'lowpass', vol);
        this.tone('sawtooth', 70, 50, 0.7, 0.15, vol);
        break;
      case 'hurt':
        this.tone('sawtooth', 300, 120, 0.25, 0.4, vol);
        break;
      case 'death':
        this.tone('sawtooth', 400, 40, 1.2, 0.5, vol);
        this.noise(0.8, 600, 0.4, 'lowpass', vol);
        break;
      case 'impAlert':
        this.tone('sawtooth', 220, 90, 0.5, 0.35, vol);
        this.tone('sawtooth', 233, 95, 0.5, 0.25, vol);
        break;
      case 'demonAlert':
        this.tone('sawtooth', 110, 55, 0.6, 0.45, vol);
        this.noise(0.5, 250, 0.3, 'lowpass', vol);
        break;
      case 'fireball':
        this.noise(0.4, 900, 0.4, 'bandpass', vol);
        break;
      case 'explode':
        this.noise(0.5, 500, 0.8, 'lowpass', vol);
        break;
      case 'bite':
        this.noise(0.1, 3000, 0.5, 'highpass', vol);
        this.tone('square', 150, 80, 0.12, 0.3, vol);
        break;
      case 'monsterPain':
        this.tone('sawtooth', 350, 180, 0.2, 0.3, vol);
        break;
      case 'monsterDie':
        this.tone('sawtooth', 260, 50, 0.7, 0.4, vol);
        this.noise(0.4, 400, 0.4, 'lowpass', vol);
        break;
      case 'exit':
        [400, 500, 600, 800].forEach((f, i) => this.tone('square', f, f, 0.15, 0.25, vol, i * 0.12));
        break;
    }
  }
}
