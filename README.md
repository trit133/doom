# doom

A Doom-style first-person shooter for the browser, built with React + TypeScript + Vite.

Everything is original and generated at runtime — the raycasting renderer, procedural
textures/sprites, and Web Audio synthesized sound effects. No game data files required.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ — deploy anywhere (Netlify, Vercel, GitHub Pages…)
npm run phone    # build + serve on your LAN so you can open it on a phone over Wi-Fi
```

## iPhone / mobile

It's an installable web app (PWA). Open the site in Safari → **Share** → **Add to Home Screen**,
and it launches fullscreen with its own icon and works offline after the first load.

- Play in landscape. On-screen controls: left thumb = joystick (push fully to run), right thumb =
  drag to aim, **FIRE** (hold; drag it to aim while shooting), **USE**, **⇄** swap weapon, **MAP**, **❚❚** pause.
- Offline support (service worker) needs HTTPS, so host the `dist/` folder somewhere with HTTPS
  (Netlify / Vercel / GitHub Pages / Cloudflare Pages are free). Over plain `http://` on your LAN the
  game still plays, it just won't work offline.
- No sound? Check the iPhone's silent switch — iOS mutes web audio when it's on.

## Controls

| Key            | Action                   |
| -------------- | ------------------------ |
| W A S D        | Move / strafe            |
| Mouse / ← →    | Turn                     |
| Click / Ctrl   | Fire (hold for auto)     |
| E / Space      | Open doors, press switch |
| Shift          | Run                      |
| 1 / 2 / wheel  | Pistol / shotgun         |
| Tab / M        | Automap                  |
| Esc            | Pause                    |

On phones these are replaced by touch controls (see above).

Goal: fight through the base and hit the **EXIT** switch in the bottom-right room.

## Layout

- `src/game/engine.ts` — game loop, raycaster (walls, sliding doors, floor/ceiling, sprites), monster AI, weapons
- `src/game/assets.ts` — procedural textures & sprites
- `src/game/audio.ts` — synthesized sound effects
- `src/game/map.ts` — the level as an ASCII grid (legend in the file — edit it to make new levels)
- `src/components/` — React UI: title screen, game view with overlays, Doom-style status bar
