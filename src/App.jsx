import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const PAGE_SIZE = 20;

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(0);
  const [priceMin, setPriceMin] = useState(50000);
  const [priceMax, setPriceMax] = useState(500000);

  const [view, setView] = useState("dashboard"); // dashboard | history

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
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
  };

  // ===== LOAD LISTINGS (PAGINATED) =====
  const loadListings = async (run) => {
    if (!run || !agency) return;

    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

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
      .gte("listings.price", priceMin)
      .lte("listings.price", priceMax)
      .range(from, to);

    setListings(data ? data.map((r) => r.listings) : []);
    setLoading(false);
  };

  // reload listings on page / price change
  useEffect(() => {
    if (selectedRun) loadListings(selectedRun);
  }, [page, priceMin, priceMax]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (!session) return null;

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

          {runs[0] && (
            <p className="muted">
              Ultima ricerca:{" "}
              {new Date(runs[0].created_at).toLocaleString()} –{" "}
              {runs[0].new_listings_count} nuovi annunci
            </p>
          )}

          <button
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
              await loadRuns();
              setLoading(false);
            }}
          >
            Avvia ricerca
          </button>

          <h3 style={{ marginTop: 24 }}>Risultati</h3>

          {runs[0] && (
            <>
              {/* FILTRO PREZZO */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  type="number"
                  value={priceMin}
                  onChange={(e) => setPriceMin(Number(e.target.value))}
                  placeholder="Prezzo min"
                />
                <input
                  type="number"
                  value={priceMax}
                  onChange={(e) => setPriceMax(Number(e.target.value))}
                  placeholder="Prezzo max"
                />
              </div>

              {loading && <p className="muted">Caricamento…</p>}

              <ul className="results">
                {listings.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.title}
                    </a>{" "}
                    – {l.city} – €{l.price}
                  </li>
                ))}
              </ul>

              {/* PAGINAZIONE */}
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                  ← Prev
                </button>
                <button onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            onChange={(e) => {
              const run = runs.find((r) => r.id === e.target.value);
              setSelectedRun(run);
              setPage(0);
              loadListings(run);
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
