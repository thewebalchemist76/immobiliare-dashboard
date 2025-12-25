import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const PAGE_SIZE = 20;

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [view, setView] = useState("home"); // home | history | results

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

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
  const loadListings = async (run, pageIndex = 0) => {
    if (!run) return;

    setLoading(true);
    const from = pageIndex * PAGE_SIZE;
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
      .range(from, to);

    let rows = data ? data.map((r) => r.listings) : [];

    // 💰 FILTER PRICE (client-side)
    rows = rows.filter((l) => {
      if (minPrice && l.price < Number(minPrice)) return false;
      if (maxPrice && l.price > Number(maxPrice)) return false;
      return true;
    });

    setListings(rows);
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
          <button onClick={() => setView("home")}>Dashboard</button>
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

      {/* HOME */}
      {view === "home" && (
        <div className="card">
          <h3>Avvia ricerca</h3>

          <button
            onClick={async () => {
              await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/run-agency`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ agency_id: agency.id }),
                }
              );

              await loadRuns();
            }}
          >
            Avvia ricerca
          </button>

          {runs[0] && (
            <p className="muted" style={{ marginTop: 12 }}>
              Ultima ricerca:{" "}
              {new Date(runs[0].created_at).toLocaleString()} –{" "}
              {runs[0].new_listings_count} nuovi annunci
            </p>
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
              setView("results");
              loadListings(run, 0);
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

      {/* RESULTS */}
      {view === "results" && (
        <div className="card">
          <h3>Risultati</h3>

          {/* FILTER */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
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
            <button onClick={() => loadListings(selectedRun, 0)}>
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
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button
                disabled={page === 0}
                onClick={() => {
                  const p = page - 1;
                  setPage(p);
                  loadListings(selectedRun, p);
                }}
              >
                ← Prev
              </button>
              <button
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  loadListings(selectedRun, p);
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
