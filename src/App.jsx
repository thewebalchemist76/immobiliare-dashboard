import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const POLL_INTERVAL = 5000;

export default function App() {
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL ||
    "https://immobiliare-backend.onrender.com";

  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [view, setView] = useState("dashboard"); // dashboard | history
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);

  const pollRef = useRef(null);

  // ================= AUTH =================
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // ================= AGENCY =================
  useEffect(() => {
    if (!session) return;

    supabase
      .from("agencies")
      .select("*")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setAgency(data || null));
  }, [session]);

  // ================= RUNS =================
  const loadRuns = async () => {
    if (!agency?.id) return [];

    const { data, error } = await supabase
      .from("agency_runs")
      .select("id, created_at, run_completed_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadRuns:", error.message);
      setRuns([]);
      return [];
    }

    setRuns(data || []);
    return data || [];
  };

  useEffect(() => {
    if (!agency?.id) return;
    loadRuns();
  }, [agency?.id]);

  // ================= POLLING =================
  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const updated = await loadRuns();
      const running = updated.some((r) => r.run_completed_at === null);
      if (!running) {
        stopPolling();
        setLoadingRun(false);
      }
    }, POLL_INTERVAL);
  };

  useEffect(() => {
    const latest = runs[0];
    if (latest && latest.run_completed_at === null) {
      setLoadingRun(true);
      startPolling();
    } else {
      setLoadingRun(false);
      stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs?.[0]?.id, runs?.[0]?.run_completed_at]);

  // ================= START RUN =================
  const startRun = async () => {
    if (!agency?.id) return;

    setLoadingRun(true);

    await fetch(`${BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });

    await loadRuns();
    startPolling();
  };

  // ================= LISTINGS =================
  const loadListingsForRun = async (run) => {
    setSelectedRun(run);
    setListings([]);

    if (!run || run.run_completed_at === null) return;

    setLoadingListings(true);

    const { data, error } = await supabase
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

    if (error) {
      console.error("loadListingsForRun:", error.message);
      setLoadingListings(false);
      return;
    }

    setListings((data || []).map((r) => r.listings));
    setLoadingListings(false);
  };

  const signOut = async () => {
    stopPolling();
    await supabase.auth.signOut();
  };

  // ================= LOGIN =================
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

          {loadingRun && <p className="muted">Ricerca in corso…</p>}

          {latestRun ? (
            <p className="muted">
              Ultima ricerca:{" "}
              {new Date(latestRun.created_at).toLocaleString()} –{" "}
              {latestRun.run_completed_at === null
                ? "elaborazione in corso…"
                : `${latestRun.new_listings_count} nuovi annunci`}
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
                {r.run_completed_at === null
                  ? "elaborazione in corso…"
                  : `${r.new_listings_count} nuovi annunci`}
              </option>
            ))}
          </select>

          {selectedRun && selectedRun.run_completed_at === null && (
            <p className="muted">
              Elaborazione annunci in corso… (aggiorno ogni 5s)
            </p>
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

          {!loadingListings &&
            selectedRun &&
            selectedRun.run_completed_at !== null &&
            listings.length === 0 && (
              <p className="muted">Nessun annuncio per questo run.</p>
            )}
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
