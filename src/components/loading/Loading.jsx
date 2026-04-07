import { useState, useEffect } from 'react';
import ArcyFloat from '../../assets/images/arcy-poses/arcy-float.png';
import { LOADING_LINES, randomFrom } from '../../lib/copy/lore';

export default function LoadingScreen() {
  const [line, setLine] = useState(() => randomFrom(LOADING_LINES));

  // Rotate the line every 3 seconds if loading takes a while
  useEffect(() => {
    const interval = setInterval(() => {
      setLine(randomFrom(LOADING_LINES));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-space-bg">
      <div className="absolute h-72 w-72 rounded-full bg-brand-purple/20 blur-3xl animate-pulse" />

      <div className="relative inline-block animate-float">
        <img
          src={ArcyFloat}
          alt="Loading..."
          className="h-32 w-auto drop-shadow-[0_0_25px_rgba(168,85,247,0.6)]"
        />
      </div>

      <div className="absolute bottom-20 text-sm tracking-wide text-ui-muted animate-pulse text-center px-6">
        {line}
      </div>
    </div>
  );
}
