import React, { useEffect, useState } from 'react';
import AppLogo from './AppLogo';

interface Props {
  onFinish: () => void;
}

const LoadingScreen: React.FC<Props> = ({ onFinish }) => {
  const [phase, setPhase] = useState<'boot' | 'ready' | 'exit'>('boot');
  const [progress, setProgress] = useState(0);
  const [line2, setLine2] = useState('');
  const [line3, setLine3] = useState('');

  useEffect(() => {
    const t1 = setTimeout(() => setLine2('Loading modules...'), 400);
    const t2 = setTimeout(() => setLine3('Calibrating neural interface...'), 900);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 8 + 2;
      });
    }, 120);

    const t3 = setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setPhase('ready');
      setTimeout(() => {
        setPhase('exit');
        setTimeout(onFinish, 600);
      }, 500);
    }, 2500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearInterval(interval); };
  }, []);

  const pct = Math.min(100, Math.round(progress));

  return (
    <div className={`loading-screen ${phase === 'exit' ? 'loading-exit' : ''}`}>
      <div className="loading-grid" />
      <div className="loading-scanline" />

      <div className="loading-content">
        <div className="loading-logo-container">
          <AppLogo size={72} animated variant="cyber" />
          <div className="loading-logo-text">
            <span className="loading-logo-p">P</span>
            <span className="loading-logo-u">U</span>
            <span className="loading-logo-r">R</span>
            <span className="loading-logo-p2">P</span>
            <span className="loading-logo-l">L</span>
            <span className="loading-logo-e">E</span>
          </div>
        </div>
        <div className="loading-subtitle">DEVELOPMENT TERMINAL</div>

        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ width: `${pct}%` }} />
          <div className="loading-bar-glow" style={{ left: `${pct}%` }} />
        </div>

        <div className="loading-text">
          <div className="loading-line">Booting kernel... <span className={pct > 5 ? 'loading-done' : ''}>✓</span></div>
          <div className={`loading-line ${line2 ? 'active' : ''}`}>{line2} <span className={pct > 30 ? 'loading-done' : ''}>{line2 ? '✓' : ''}</span></div>
          <div className={`loading-line ${line3 ? 'active' : ''}`}>{line3} <span className={pct > 60 ? 'loading-done' : ''}>{line3 ? '✓' : ''}</span></div>
          <div className={`loading-line ${pct >= 100 ? 'active' : ''}`}>
            {pct >= 100 ? 'System ready.' : 'Initializing...'}
            <span className={pct >= 100 ? 'loading-done' : ''}>{pct >= 100 ? ' ✓' : ` ${pct}%`}</span>
          </div>
        </div>
      </div>

      <div className="loading-corner tl" />
      <div className="loading-corner tr" />
      <div className="loading-corner bl" />
      <div className="loading-corner br" />
    </div>
  );
};

export default LoadingScreen;
