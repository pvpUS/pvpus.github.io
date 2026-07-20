import { useEffect, useRef, useState } from 'react';
import { CSV_URL, STAGES } from './sm64/config';
import { parseCSV, formatSeconds, computeLeaderboard } from './sm64/lib';
import { loadCache, saveCache } from './sm64/cache';

export default function Coin100Overlay({ onClose }) {
  const cachedRef = useRef(undefined);
  if (cachedRef.current === undefined) cachedRef.current = loadCache();
  const cached = cachedRef.current;

  const [state, setState] = useState(() =>
    cached
      ? { status: 'ready', leaderboard: cached.leaderboard, playerCount: cached.playerCount, error: null }
      : { status: 'loading', leaderboard: [], playerCount: 0, error: null }
  );

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetch(CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`sheet fetch failed: HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const { leaderboard, playerCount } = computeLeaderboard(parseCSV(text));
        saveCache({ leaderboard, playerCount });
        setState({ status: 'ready', leaderboard, playerCount, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({ ...s, status: 'error', error: err.message }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="coin100-backdrop" onClick={onClose}>
      <div className="coin100-panel" onClick={(e) => e.stopPropagation()}>
        <div className="coin100-header">
          <h1>SM64 100-Coin Sum of Best</h1>
          <button className="coin100-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {state.status === 'loading' && <p className="coin100-status">loading…</p>}
        {state.status === 'error' && (
          <p className="coin100-status coin100-error">failed to load: {state.error}</p>
        )}

        {state.status === 'ready' && (
          <>
            <div className="coin100-table-wrap">
              <table className="coin100-table">
                <thead>
                  <tr>
                    <th className="coin100-row-label"></th>
                    {state.leaderboard.map((entry, i) => (
                      <th key={entry.name}>
                        <span className="coin100-rank">{i + 1}</span> {entry.name}
                      </th>
                    ))}
                    {state.leaderboard.length === 0 && <th>No qualifying players yet.</th>}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="coin100-row-label">Sum</td>
                    {state.leaderboard.map((entry) => (
                      <td key={entry.name} className="coin100-sum">{formatSeconds(entry.sum)}</td>
                    ))}
                  </tr>
                  {STAGES.map((s) => (
                    <tr key={s.code}>
                      <td className="coin100-row-label" title={s.name}>{s.code}</td>
                      {state.leaderboard.map((entry) => (
                        <td key={entry.name}>{formatSeconds(entry.stageTimes[s.code])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="coin100-meta">
              {state.leaderboard.length} of {state.playerCount} tracked players have a 100-coin time on all {STAGES.length} stages
            </div>
          </>
        )}
      </div>
    </div>
  );
}
