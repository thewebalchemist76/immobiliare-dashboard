import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const POLL_INTERVAL = 5000;
const PAGE_SIZE = 20;

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

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [page, setPage] = useState(0);

  const pollRef = useRef(null);

  // ===== AUTH =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
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

  // ===== POLLING =====
  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(loadRuns, POLL_INTERVAL);
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

    await loadRuns();
    startPolling();
    setTimeout(() => setLoadingRun(false), 2000);
  };

  // ===== LOAD LISTINGS (FIX DEFINITIVO) =====
  const loadListingsForRun = async (run) => {
    setSelectedRun(run);
    setListings([]);
    setPage(0);

    setLoadingListings(true);

    let query = supabase
      .from("agency_run_listings")
      .select(
        `
        listings!inner (
          id,
          title,
          city,
          province,
          price,
          url
        )
      `
      )
      .eq("run_id", run.id);

    if (priceMin) query = query.gte("listings.price", priceMin);
    if (priceMax) query = query.lte("listings.price", priceMax);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await query
      .order("listings.price", { ascending: true })
      .range(from, to);

    if (error) {
      console.error(error);
      setListings([]);
    } else {
      setListings((data || []).map((r) => r.listings));
    }

    setLoadingListings(false);
  };

  const latestRun = runs[0];

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
          <button onClick={() => setView("history")}>Le mie ricerche</button>
        </div>
      </div>

      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="card">
          <h3>Avvia ricerca</h3>
          <button onClick={startRun} disabled={loadingRun}>
            Avvia ricerca
          </button>

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

          {selectedRun && (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  placeholder="Prezzo min"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                />
                <input
                  placeholder="Prezzo max"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                />
                <button onClick={() => loadListingsForRun(selectedRun)}>
                  Applica
                </button>
              </div>

              {loadingListings && (
                <p className="muted">Caricamento annunci…</p>
              )}

              {!loadingListings && listings.length === 0 && (
                <p className="muted">
                  Nessun annuncio per questa ricerca.
                </p>
              )}

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

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={page === 0}
                  onClick={() => {
                    setPage((p) => p - 1);
                    loadListingsForRun(selectedRun);
                  }}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => {
                    setPage((p) => p + 1);
                    loadListingsForRun(selectedRun);
                  }}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
