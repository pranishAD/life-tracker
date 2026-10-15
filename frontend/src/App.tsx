// Placeholder root component so `docker compose up` serves something at
// http://localhost:5173 during Phase 0/2 verification.
// frontend-dev: replace with the real app (router, pages, etc.) once
// design/tokens.json and docs/api-contract.yaml are approved.
function App() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Life Tracker</h1>
      <p>Frontend skeleton is running. frontend-dev builds the real app here.</p>
    </div>
  );
}

export default App;
