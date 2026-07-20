import { useCallback, useEffect, useState } from 'react';
import RandomVisualizer from './RandomVisualizer';
import Coin100Overlay from './Coin100Overlay';

const COIN100_PARAM = '100c';

function hasCoin100Param() {
  return new URLSearchParams(window.location.search).has(COIN100_PARAM);
}

// Writes/removes the bare "?100c" flag (no "=") so a link copied out of the
// address bar reads cleanly, then pushes it as history so back/forward and
// a directly-pasted link both land on the right state.
function setCoin100Param(present) {
  const url = new URL(window.location.href);
  const parts = url.search
    .replace(/^\?/, '')
    .split('&')
    .filter((p) => p && p !== COIN100_PARAM && !p.startsWith(`${COIN100_PARAM}=`));
  if (present) parts.unshift(COIN100_PARAM);
  url.search = parts.length ? `?${parts.join('&')}` : '';
  window.history.pushState({}, '', url);
}

function App() {
  const [coin100Open, setCoin100Open] = useState(hasCoin100Param);

  const openCoin100 = useCallback((e) => {
    e.preventDefault();
    setCoin100Open(true);
    setCoin100Param(true);
  }, []);

  const closeCoin100 = useCallback(() => {
    setCoin100Open(false);
    setCoin100Param(false);
  }, []);

  useEffect(() => {
    function onPopState() {
      setCoin100Open(hasCoin100Param());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <>
      <RandomVisualizer />
      <a href="/ident.txt" className="pgp-key-link" title="identity & PGP key">
        ident
      </a>
      <a
        href={`?${COIN100_PARAM}`}
        className="pgp-key-link coin100-link"
        title="SM64 100-coin sum of best"
        onClick={openCoin100}
      >
        100c
      </a>
      {coin100Open && <Coin100Overlay onClose={closeCoin100} />}
    </>
  );
}

export default App;
