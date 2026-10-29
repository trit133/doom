import { useMemo, useState } from 'react';
import { Sound } from './game/audio';
import GameView from './components/GameView';
import TitleScreen from './components/TitleScreen';

export default function App() {
  const sound = useMemo(() => new Sound(), []);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);

  const start = () => {
    sound.unlock();
    setRun((r) => r + 1);
    setPlaying(true);
  };

  return playing ? (
    <GameView key={run} sound={sound} onRestart={start} onQuit={() => setPlaying(false)} />
  ) : (
    <TitleScreen onStart={start} />
  );
}
