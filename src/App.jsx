import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

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

  const [allListings, setAllListings] = useState([]);
  const [filteredListings, setFilteredListings] = useState([]);

  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const [page, setPage] = useState(1);

  /* ================= AUTH ================= */

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  /* ================= AGENCY ================= */

  useEffect(() => {
    if (!session) return;

    supabase
      .from("agencies")
      .select("*")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setAgency(data || null));
  }, [session]);

  /* ================= RUNS ================= */

  const loadRuns = async () => {
    if (!agency?.id) return;

    const { data, error } = await supabase
      .from("agency_runs")
      .select("id, created_at, apify_run_id, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadRuns:", error.message);
      setRuns([]);
      return;
    }

    setRuns(data || []);
  };

  useEffect(() => {
    if (agency?.id) loadRuns();
  }, [agency?.id]);

  /* ================= START RUN ================= */

  const startRun = async () => {
    if (!agency?.id) return;

    setLoadingRun(true);

    try {
      await fetch(`${BACKEND_URL}/run-agency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency_id: agency.id }),
      });
    } catch (e) {
      console.error("startRun error:", e);
    }

    setTimeout(() => {
      loadRuns();
      setLoadingRun(false);
    }, 1500);
  };

  /* ================= LISTINGS ================= */

  const loadListingsForRun = async (run) => {
    setSelectedRun(run);
    setAllListings([]);
    setFilteredListings([]);
    setPage(1);
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
      .eq("run_id", run.id);

    setLoadingListings(false);

    if (error) {
      console.error("loadListingsForRun:", error.message);
      return;
    }

    const list = (data || []).map((r) => r.listings);
    setAllListings(list);
    setFilteredListings(list);
  };

  /* ================= FILTER ================= */

  const applyFilter = () => {
    let res = [...allListings];

    if (priceMin) res = res.filter((l) => l.price >= Number(priceMin));
    if (priceMax) res = res.filter((l) => l.price <= Number(priceMax));

    setFilteredListings(res);
    setPage(1);
  };

  /* ================= PAGINATION ================= */

  const totalPages = Math.ceil(filteredListings.length / PAGE_SIZE);

  const paginatedListings = filteredListings.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  /* ================= LOGOUT ================= */

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  /* ================= LOGIN ================= */

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

  const latestRun = runs[0] || null;

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

          {loadingRun && <p className="muted">Ricerca avviata…</p>}

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
              {/* FILTER */}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
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

              {loadingListings && (
                <p className="muted">Caricamento annunci…</p>
              )}

              {!loadingListings && filteredListings.length === 0 && (
                <p className="muted">Nessun annuncio.</p>
              )}

              <ul className="results">
                {paginatedListings.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.title}
                    </a>{" "}
                    – {l.city} ({l.province}) – €{l.price}
                  </li>
                ))}
              </ul>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
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
