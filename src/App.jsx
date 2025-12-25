import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabase";
import "./App.css";

const POLL_INTERVAL = 5000;

export default function App() {
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

  // ===== LOAD RUNS =====
  const loadRuns = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, run_completed_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
    return data || [];
  };

  // ===== POLLING =====
  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const updatedRuns = await loadRuns();
      const stillRunning = updatedRuns.some(
        (r) => r.run_completed_at === null
      );

      if (!stillRunning) {
        stopPolling();
        setLoadingRun(false);
      }
    }, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ===== START RUN =====
  const startRun = async () => {
    if (!agency) return;

    setLoadingRun(true);
    setView("dashboard");

    await fetch(
      "https://immobiliare-backend.onrender.com/run-agency",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency_id: agency.id }),
      }
    );

    await loadRuns();
    startPolling();
  };

  // ===== LOAD LISTINGS =====
  const loadListingsForRun = async (run) => {
    setSelectedRun(run);
    setListings([]);

    if (!run.run_completed_at) {
      return;
    }

    setLoadingListings(true);

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
      .eq("run_id", run.id)
      .order("listings.price", { ascending: true });

    if (data) {
      setListings(data.map((r) => r.listings));
    }

    setLoadingListings(false);
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
              await loadRuns();
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

          <button onClick={startRun} disabled={loadingRun}>
            Avvia ricerca
          </button>

          {loadingRun && (
            <p className="muted">Ricerca in corso…</p>
          )}

          {runs[0] && (
            <p className="muted">
              Ultima ricerca:{" "}
              {new Date(runs[0].created_at).toLocaleString()} –{" "}
              {runs[0].run_completed_at
                ? `${runs[0].new_listings_count} nuovi annunci`
                : "elaborazione in corso"}
            </p>
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
                {r.run_completed_at
                  ? `${r.new_listings_count} nuovi annunci`
                  : "elaborazione in corso…"}
              </option>
            ))}
          </select>

          {selectedRun && !selectedRun.run_completed_at && (
            <p className="muted">Elaborazione annunci in corso…</p>
          )}

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

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
