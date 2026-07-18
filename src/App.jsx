import RandomVisualizer from './RandomVisualizer';

function App() {
  return (
    <>
      <RandomVisualizer />
      <a href="/pgp-key.asc" className="pgp-key-link" title="PGP public key">
        PGP
      </a>
    </>
  );
}

export default App;
