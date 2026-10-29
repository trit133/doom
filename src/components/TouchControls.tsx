import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Game } from '../game/engine';

interface Props {
  gameRef: RefObject<Game | null>;
  hasShotgun: boolean;
  onPause: () => void;
}

const STICK_RADIUS = 56; // px the knob can travel from the stick's center
const TURN_SPEED = 0.0075; // radians per px of horizontal drag

type PE = ReactPointerEvent<HTMLElement>;

/**
 * On-screen controls: a floating joystick on the left half, drag-to-turn on the right
 * half, and FIRE / USE / weapon / map / pause buttons. The FIRE button can also be
 * dragged to aim while shooting.
 */
export default function TouchControls({ gameRef, hasShotgun, onPause }: Props) {
  const stickId = useRef<number | null>(null);
  const stickOrigin = useRef({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const lookX = useRef(new Map<number, number>()); // pointerId -> last x, for turning

  const game = () => gameRef.current;

  // Release everything if the controls go away (pause, death, rotation).
  useEffect(
    () => () => {
      gameRef.current?.setMove(0, 0);
      gameRef.current?.setFiring(false);
    },
    [gameRef],
  );

  const capture = (e: PE) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // ---- joystick (left half): appears wherever the thumb lands
  const stickDown = (e: PE) => {
    if (stickId.current !== null) return;
    capture(e);
    stickId.current = e.pointerId;
    stickOrigin.current = { x: e.clientX, y: e.clientY };
    const base = baseRef.current!;
    base.style.left = `${e.clientX}px`;
    base.style.top = `${e.clientY}px`;
    base.classList.add('active');
    knobRef.current!.style.transform = 'translate(-50%, -50%)';
  };

  const stickMove = (e: PE) => {
    if (e.pointerId !== stickId.current) return;
    let dx = e.clientX - stickOrigin.current.x;
    let dy = e.clientY - stickOrigin.current.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    knobRef.current!.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    game()?.setMove(-dy / STICK_RADIUS, dx / STICK_RADIUS);
  };

  const stickUp = (e: PE) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null;
    baseRef.current!.classList.remove('active');
    game()?.setMove(0, 0);
  };

  // ---- turning (right half and the FIRE button)
  const lookDown = (e: PE) => {
    capture(e);
    lookX.current.set(e.pointerId, e.clientX);
  };

  const lookMove = (e: PE) => {
    const last = lookX.current.get(e.pointerId);
    if (last === undefined) return;
    game()?.addTurn((e.clientX - last) * TURN_SPEED);
    lookX.current.set(e.pointerId, e.clientX);
  };

  const lookUp = (e: PE) => {
    lookX.current.delete(e.pointerId);
  };

  const tap = (action: (g: Game) => void) => (e: PE) => {
    e.preventDefault();
    e.stopPropagation();
    const g = game();
    if (g) action(g);
  };

  return (
    <div className="touch-controls">
      <div
        className="stick-zone"
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
      >
        <div className="stick-base" ref={baseRef}>
          <div className="stick-knob" ref={knobRef} />
        </div>
        <span className="zone-hint">MOVE</span>
      </div>

      <div className="look-zone" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp}>
        <span className="zone-hint">DRAG TO AIM</span>
      </div>

      <button
        className="tbtn fire"
        onPointerDown={(e) => { lookDown(e); game()?.setFiring(true); }}
        onPointerMove={lookMove}
        onPointerUp={(e) => { lookUp(e); game()?.setFiring(false); }}
        onPointerCancel={(e) => { lookUp(e); game()?.setFiring(false); }}
      >
        FIRE
      </button>
      <button className="tbtn use" onPointerDown={tap((g) => g.use())}>USE</button>
      {hasShotgun && (
        <button className="tbtn swap" onPointerDown={tap((g) => g.nextWeapon())}>⇄</button>
      )}
      <div className="tbar">
        <button className="tbtn small" onPointerDown={tap((g) => g.toggleMap())}>MAP</button>
        {/* onClick, not onPointerDown: pausing removes these controls, and the tap's trailing
            click would otherwise land on the pause overlay and immediately resume. */}
        <button className="tbtn small" onClick={onPause}>❚❚</button>
      </div>
    </div>
  );
}
