import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const POLL_INTERVAL = 5000;

export default function App() {
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "https://immobiliare-backend.onrender.com";

  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [view, setView] = useState("dashboard"); // dashboard | history
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);

  const pollRef = useRef(null);

  // ===== AUTH =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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
      .then(({ data }) => setAgency(data || null));
  }, [session]);

  // ===== LOAD RUNS =====
  const loadRuns = async () => {
    if (!agency?.id) return [];

    const { data, error } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setRuns([]);
      return [];
    }

    setRuns(data || []);
    return data || [];
  };

  useEffect(() => {
    if (agency?.id) loadRuns();
  }, [agency?.id]);

  // ===== POLLING: controlla se arrivano listings =====
  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const startPolling = (runId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const { count } = await supabase
        .from("agency_run_listings")
        .select("*", { count: "exact", head: true })
        .eq("run_id", runId);

      if (count > 0) {
        stopPolling();
        setLoadingRun(false);
        await loadRuns();
      }
    }, POLL_INTERVAL);
  };

  // ===== START RUN =====
  const startRun = async () => {
    if (!agency?.id) return;

    setLoadingRun(true);

    await fetch(`${BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });

    const updated = await loadRuns();
    if (updated[0]) startPolling(updated[0].id);
  };

  // ===== LOAD LISTINGS =====
  const loadListingsForRun = async (run) => {
    setSelectedRun(run);
    setListings([]);
    setLoadingListings(true);

    const { data, error } = await supabase
      .from("agency_run_listings")
      .select(
        `listings ( id, title, city, province, price, url )`
      )
      .eq("run_id", run.id)
      .order("listings.price", { ascending: true });

    setLoadingListings(false);

    if (error) {
      console.error(error);
      return;
    }

    setListings((data || []).map((r) => r.listings));
  };

  const signOut = async () => {
    stopPolling();
    await supabase.auth.signOut();
  };

  // ===== LOGIN =====
  if (!session) {
    return (
      <div className="card">
        <h2>Login</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            supabase.auth.signInWithOtp({
              email: e.target.email.value,
              options: { emailRedirectTo: window.location.origin },
            });
          }}
        >
          <input name="email" placeholder="email" />
          <button>Invia magic link</button>
        </form>
      </div>
    );
  }

  const latestRun = runs[0];

  return (
    <div>
      {/* HEADER */}
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>
        <button onClick={() => setView("dashboard")}>Dashboard</button>
        <button onClick={() => setView("history")}>Le mie ricerche</button>
      </div>

      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="card">
          <h3>Avvia ricerca</h3>
          <button onClick={startRun} disabled={loadingRun}>
            Avvia ricerca
          </button>

          {loadingRun && <p className="muted">Ricerca in corso…</p>}

          {latestRun ? (
            <p className="muted">
              Ultima ricerca:{" "}
              {new Date(latestRun.created_at).toLocaleString()} –{" "}
              {latestRun.new_listings_count} nuovi annunci
            </p>
          ) : (
            <p className="muted">Nessuna ricerca ancora.</p>
          )}
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedRun?.id || ""}
            onChange={(e) => {
              const run = runs.find((r) => r.id === e.target.value);
              if (run) loadListingsForRun(run);
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

          {loadingListings && <p className="muted">Caricamento annunci…</p>}

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
        </div>
      )}

      <button onClick={signOut}>Logout</button>
    </div>
  );
}
