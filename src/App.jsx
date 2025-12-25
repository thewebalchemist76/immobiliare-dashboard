import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const PAGE_SIZE = 20;

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [view, setView] = useState("dashboard"); // dashboard | history
  const [runs, setRuns] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);

  const [allListings, setAllListings] = useState([]);
  const [filteredListings, setFilteredListings] = useState([]);
  const [page, setPage] = useState(0);

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const [loading, setLoading] = useState(false);

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
      .then(({ data }) => setAgency(data));
  }, [session]);

  // ================= RUNS =================
  const loadRuns = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);

    if (data?.length) {
      loadRunListings(data[0]);
    }
  };

  // ================= LISTINGS PER RUN =================
  const loadRunListings = async (run) => {
    setLoading(true);
    setCurrentRun(run);
    setPage(0);

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
      .eq("run_id", run.id);

    const listings = (data || []).map((r) => r.listings);
    setAllListings(listings);
    setFilteredListings(listings);
    setLoading(false);
  };

  // ================= FILTER =================
  const applyFilter = () => {
    let res = [...allListings];

    if (priceMin) {
      res = res.filter(
        (l) => Number(l.price) >= Number(priceMin)
      );
    }
    if (priceMax) {
      res = res.filter(
        (l) => Number(l.price) <= Number(priceMax)
      );
    }

    setFilteredListings(res);
    setPage(0);
  };

  // ================= RUN AGENCY =================
  const runAgency = async () => {
    if (!agency) return;

    setLoading(true);

    await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/run-agency`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency_id: agency.id }),
      }
    );

    // aspettiamo webhook
    setTimeout(loadRuns, 6000);
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

  const paginated = filteredListings.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );

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
        <>
          <div className="card">
            <h3>Avvia ricerca</h3>
            <button onClick={runAgency} disabled={loading}>
              {loading ? "Ricerca in corso…" : "Avvia ricerca"}
            </button>

            {currentRun && (
              <p className="muted">
                Ultima ricerca:{" "}
                {new Date(currentRun.created_at).toLocaleString()} –{" "}
                {currentRun.new_listings_count} nuovi annunci
              </p>
            )}
          </div>

          <div className="card">
            <h3>Risultati</h3>

            <div style={{ display: "flex", gap: 8 }}>
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
              <button onClick={applyFilter}>Applica</button>
            </div>

            {loading && <p className="muted">Caricamento…</p>}

            <ul className="results">
              {paginated.map((l) => (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.title}
                  </a>{" "}
                  – {l.city} – €{l.price}
                </li>
              ))}
            </ul>

            <div style={{ display: "flex", gap: 12 }}>
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                ← Prev
              </button>
              <button
                disabled={(page + 1) * PAGE_SIZE >= filteredListings.length}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            onChange={(e) => {
              const run = runs.find((r) => r.id === e.target.value);
              if (run) loadRunListings(run);
              setView("dashboard");
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
