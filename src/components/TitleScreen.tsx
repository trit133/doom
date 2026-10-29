import { useEffect } from 'react';
import { isIOS, isStandalone, isTouchDevice } from '../device';

const TOUCH_CONTROLS: [string, string][] = [
  ['Left thumb', 'Move (push far to run)'],
  ['Right thumb', 'Drag to aim'],
  ['FIRE', 'Hold to shoot, drag to aim'],
  ['USE', 'Open doors, hit switches'],
  ['⇄', 'Swap weapon'],
  ['MAP / ❚❚', 'Automap / pause'],
];

const KEYBOARD_CONTROLS: [string, string][] = [
  ['W A S D', 'Move / strafe'],
  ['Mouse', 'Turn'],
  ['Click / Ctrl', 'Fire'],
  ['E / Space', 'Open doors, hit switches'],
  ['Shift', 'Run'],
  ['1 / 2', 'Pistol / shotgun'],
  ['Tab / M', 'Automap'],
  ['Esc', 'Pause'],
];

export default function TitleScreen({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="title">
      <h1 className="logo">DOOM</h1>
      <p className="subtitle">WEB EDITION</p>
      <p className="tagline">Fight through the base, find the EXIT switch.</p>
      <button className="btn" onClick={onStart} autoFocus>
        NEW GAME
      </button>
      {!isTouchDevice && <p className="hint">or press Enter</p>}
      {isIOS && !isStandalone && (
        <p className="install">
          Play fullscreen: tap <b>Share</b> → <b>Add to Home Screen</b>
        </p>
      )}
      <dl className="controls">
        {(isTouchDevice ? TOUCH_CONTROLS : KEYBOARD_CONTROLS).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
