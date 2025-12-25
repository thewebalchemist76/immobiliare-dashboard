import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const PAGE_SIZE = 20;

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [view, setView] = useState("dashboard"); // dashboard | history
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(0);

  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

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
  const loadMyRuns = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
  };

  // ===== LOAD LISTINGS (PREZZO FIXATO) =====
  const loadListingsForRun = async (runId, pageIndex = 0) => {
    setLoading(true);
    setSelectedRunId(runId);
    setPage(pageIndex);

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
      .eq("run_id", runId)
      .range(
        pageIndex * PAGE_SIZE,
        pageIndex * PAGE_SIZE + PAGE_SIZE - 1
      );

    if (minPrice) {
      query = query.gte("listings.price", Number(minPrice));
    }

    if (maxPrice) {
      query = query.lte("listings.price", Number(maxPrice));
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      setListings([]);
    } else {
      setListings((data || []).map((r) => r.listings));
    }

    setLoading(false);
    setView("dashboard");
  };

  // ===== RUN SEARCH =====
  const startRun = async () => {
    if (!agency) return;

    setLoading(true);
    setListings([]);

    await fetch(`${import.meta.env.VITE_BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });

    await loadMyRuns();
    setLoading(false);
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
        <>
          <div className="card">
            <h3>Avvia ricerca</h3>

            <button onClick={startRun} disabled={loading}>
              {loading ? "Ricerca in corso…" : "Avvia ricerca"}
            </button>

            {runs[0] && (
              <p className="muted">
                Ultima ricerca:{" "}
                {new Date(runs[0].created_at).toLocaleString()} –{" "}
                {runs[0].new_listings_count} nuovi annunci
              </p>
            )}
          </div>

          <div className="card">
            <h3>Risultati</h3>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Prezzo min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <input
                placeholder="Prezzo max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
              <button
                disabled={!selectedRunId}
                onClick={() => loadListingsForRun(selectedRunId, 0)}
              >
                Applica
              </button>
            </div>

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

            {listings.length > 0 && (
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  disabled={page === 0}
                  onClick={() => loadListingsForRun(selectedRunId, page - 1)}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => loadListingsForRun(selectedRunId, page + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedRunId || ""}
            onChange={(e) => {
              const runId = e.target.value;
              if (runId) loadListingsForRun(runId, 0);
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
        <button onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>
    </div>
  );
}
