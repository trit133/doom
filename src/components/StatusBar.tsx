import type { HudState } from '../game/engine';

function Face({ health, dead }: { health: number; dead: boolean }) {
  const hurt = health < 60;
  const critical = health < 30;
  return (
    <svg viewBox="0 0 40 44" className="face" aria-label={`Health ${health}%`}>
      <rect x="6" y="4" width="28" height="36" rx="9" fill="#d29a62" />
      <rect x="6" y="4" width="28" height="9" rx="4" fill="#5a3a1a" />
      {dead ? (
        <>
          <path d="M12 17l6 6M18 17l-6 6M22 17l6 6M28 17l-6 6" stroke="#300" strokeWidth="2" />
          <rect x="13" y="30" width="14" height="4" fill="#600" />
        </>
      ) : (
        <>
          <rect x="11" y="18" width="7" height="4" fill="#fff" />
          <rect x="22" y="18" width="7" height="4" fill="#fff" />
          <rect x="13" y="18" width="3" height="4" fill="#234" />
          <rect x="24" y="18" width="3" height="4" fill="#234" />
          <path
            d={critical ? 'M13 34q7-6 14 0' : hurt ? 'M13 32h14' : 'M13 31q7 5 14 0'}
            stroke="#600"
            strokeWidth="2"
            fill="none"
          />
        </>
      )}
      {hurt && <path d="M30 10l-3 10 4 6" stroke="#a00" strokeWidth="3" fill="none" />}
      {critical && <path d="M9 14l3 9-2 8M20 36v5" stroke="#a00" strokeWidth="3" fill="none" />}
    </svg>
  );
}

export default function StatusBar({ hud }: { hud: HudState }) {
  const ammo = hud.weapon === 0 ? hud.bullets : hud.shells;
  return (
    <div className="statusbar">
      <div className="cell">
        <span className="num">{ammo}</span>
        <span className="label">AMMO</span>
      </div>
      <div className="cell">
        <span className="num">{hud.health}%</span>
        <span className="label">HEALTH</span>
      </div>
      <div className="cell arms">
        <div className="slots">
          <span className={hud.weapon === 0 ? 'on' : ''}>1</span>
          <span className={hud.hasShotgun ? (hud.weapon === 1 ? 'on' : 'have') : ''}>2</span>
        </div>
        <span className="label">ARMS</span>
      </div>
      <div className="cell facecell">
        <Face health={hud.health} dead={hud.status === 'dead'} />
      </div>
      <div className="cell">
        <span className="num">{hud.armor}%</span>
        <span className="label">ARMOR</span>
      </div>
      <div className="cell ammo-list">
        <div><span>BULL</span><b>{hud.bullets}</b>/200</div>
        <div><span>SHEL</span><b>{hud.shells}</b>/50</div>
        <div><span>KILL</span><b>{hud.kills}</b>/{hud.totalKills}</div>
      </div>
    </div>
  );
}
