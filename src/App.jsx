import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

  const [view, setView] = useState("dashboard"); // dashboard | history
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");

  // ===== AUTH =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // ===== LOAD AGENCY =====
  useEffect(() => {
    if (!session) return;

    supabase
      .from("agencies")
      .select("*")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setAgency(data));
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ===== LOAD RUNS =====
  const loadMyRuns = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
  };

  // ===== LOAD LISTINGS FOR RUN =====
  const loadListingsForRun = async (runId) => {
    setLoading(true);
    setListings([]);

    const { data } = await supabase
      .from("agency_run_listings")
      .select(
        `
        listings (
          id,
          title,
          city,
          province,
          price,
          url
        )
      `
      )
      .eq("run_id", runId);

    if (data) {
      setListings(data.map((r) => r.listings));
    }

    setLoading(false);
    setView("dashboard");
  };

  if (!session) return null;

  const lastRun = runs[0];

  return (
    <div>
      {/* HEADER */}
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setView("dashboard")}>Dashboard</button>
          <button
            onClick={async () => {
              await loadMyRuns();
              setView("history");
            }}
          >
            Le mie ricerche
          </button>
        </div>
      </div>

      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="card">
          <h3>Avvia ricerca</h3>

          {lastRun && (
            <p className="muted">
              Ultima ricerca:{" "}
              {new Date(lastRun.created_at).toLocaleString()} –{" "}
              <strong>{lastRun.new_listings_count}</strong> nuovi annunci
            </p>
          )}

          <button
            disabled={loading || !agency}
            onClick={async () => {
              setLoading(true);

              await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/run-agency`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ agency_id: agency.id }),
                }
              );

              setTimeout(async () => {
                await loadMyRuns();
                setLoading(false);
              }, 6000);
            }}
          >
            {loading ? "Ricerca in corso…" : "Avvia ricerca"}
          </button>

          <h3 style={{ marginTop: 24 }}>Risultati</h3>

          {loading && <p className="muted">Caricamento…</p>}

          <ul className="results">
            {listings.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.title}
                </a>{" "}
                – {l.city} ({l.province}) – €{l.price}
              </li>
            ))}
          </ul>

          {!loading && listings.length === 0 && (
            <p className="muted">Seleziona una ricerca dallo storico</p>
          )}
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedRunId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedRunId(id);
              if (id) loadListingsForRun(id);
            }}
          >
            <option value="">Seleziona una ricerca…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString()} –{" "}
                {r.new_listings_count} nuovi annunci
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
