import { useEffect, useRef, useState } from 'react';
import type { Sound } from '../game/audio';
import { Game, type HudState } from '../game/engine';
import { isTouchDevice } from '../device';
import StatusBar from './StatusBar';
import TouchControls from './TouchControls';

interface Props {
  sound: Sound;
  onRestart: () => void;
  onQuit: () => void;
}

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function GameView({ sound, onRestart, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [portrait, setPortrait] = useState(() => isTouchDevice && window.matchMedia('(orientation: portrait)').matches);

  useEffect(() => {
    const game = new Game(canvasRef.current!, sound, { onHud: setHud, onPauseChange: setPaused }, isTouchDevice);
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
    game.start();
    game.lock();

    // On phones the view fills the screen, so the render width tracks the viewport's shape.
    let observer: ResizeObserver | undefined;
    if (isTouchDevice) {
      observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) game.resize(width / height);
      });
      observer.observe(viewportRef.current!);
    }
    return () => {
      observer?.disconnect();
      game.destroy();
      gameRef.current = null;
    };
  }, [sound]);

  // Phones: the game is landscape-only; pause while the phone is held upright.
  useEffect(() => {
    if (!isTouchDevice) return;
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => {
      setPortrait(mq.matches);
      if (mq.matches) gameRef.current?.setPaused(true);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const status = hud?.status ?? 'playing';
  const resume = () => gameRef.current?.lock();

  // Enter restarts from the death / victory screens.
  useEffect(() => {
    if (status === 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') onRestart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, onRestart]);

  return (
    <div className={isTouchDevice ? 'game touch' : 'game'}>
      <div className="viewport" ref={viewportRef}>
        <canvas ref={canvasRef} onClick={resume} />
        {hud?.message && status === 'playing' && <div className="message">{hud.message}</div>}

        {isTouchDevice && status === 'playing' && !paused && hud && (
          <TouchControls gameRef={gameRef} hasShotgun={hud.hasShotgun} onPause={() => gameRef.current?.setPaused(true)} />
        )}

        {status === 'playing' && paused && (
          <div className="overlay" onClick={resume}>
            <h2>PAUSED</h2>
            <p>{isTouchDevice ? 'Tap' : 'Click'} to {hud && hud.time > 0 ? 'resume' : 'start'}</p>
            <button className="btn small" onClick={(e) => { e.stopPropagation(); onQuit(); }}>
              QUIT TO TITLE
            </button>
          </div>
        )}

        {status === 'dead' && hud && (
          <div className="overlay dead">
            <h2>YOU DIED</h2>
            <p>Kills {hud.kills}/{hud.totalKills} · Time {formatTime(hud.time)}</p>
            <div className="row">
              <button className="btn small" onClick={onRestart}>TRY AGAIN</button>
              <button className="btn small" onClick={onQuit}>QUIT</button>
            </div>
          </div>
        )}

        {status === 'won' && hud && (
          <div className="overlay won">
            <h2>LEVEL COMPLETE</h2>
            <table className="stats">
              <tbody>
                <tr><td>KILLS</td><td>{Math.round((hud.kills / hud.totalKills) * 100)}%</td></tr>
                <tr><td>ITEMS</td><td>{Math.round((hud.items / hud.totalItems) * 100)}%</td></tr>
                <tr><td>TIME</td><td>{formatTime(hud.time)}</td></tr>
              </tbody>
            </table>
            <div className="row">
              <button className="btn small" onClick={onRestart}>PLAY AGAIN</button>
              <button className="btn small" onClick={onQuit}>QUIT</button>
            </div>
          </div>
        )}
      </div>
      {hud && <StatusBar hud={hud} />}

      {portrait && (
        <div className="rotate-hint">
          <div className="phone-icon" />
          <p>Rotate your phone to landscape</p>
        </div>
      )}
    </div>
  );
}
