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

  const [view, setView] = useState("dashboard");
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [page, setPage] = useState(0);

  /* ================= AUTH ================= */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
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

    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
  };

  useEffect(() => {
    if (agency?.id) loadRuns();
  }, [agency?.id]);

  /* ================= START RUN ================= */
  const startRun = async () => {
    if (!agency?.id) return;

    await fetch(`${BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });

    await loadRuns();
  };

  /* ================= LOAD LISTINGS (FIX REALE) ================= */
  const loadListingsForRun = async (run, resetPage = true) => {
    if (!run) return;

    setSelectedRun(run);
    setListings([]);
    setLoadingListings(true);
    if (resetPage) setPage(0);

    /* 1️⃣ PRENDO GLI ID DEGLI ANNUNCI */
    const { data: links } = await supabase
      .from("agency_run_listings")
      .select("listing_id")
      .eq("run_id", run.id);

    if (!links || links.length === 0) {
      setListings([]);
      setLoadingListings(false);
      return;
    }

    const listingIds = links.map((l) => l.listing_id);

    /* 2️⃣ PRENDO GLI ANNUNCI REALI */
    let query = supabase
      .from("listings")
      .select("id, title, city, province, price, url")
      .in("id", listingIds)
      .order("price", { ascending: true });

    if (priceMin) query = query.gte("price", Number(priceMin));
    if (priceMax) query = query.lte("price", Number(priceMax));

    const from = (resetPage ? 0 : page) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await query.range(from, to);

    setListings(data || []);
    setLoadingListings(false);
  };

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
          <button onClick={() => setView("history")}>Le mie ricerche</button>
        </div>
      </div>

      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="card">
          <h3>Avvia ricerca</h3>
          <button onClick={startRun}>Avvia ricerca</button>

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
              if (run) loadListingsForRun(run, true);
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

          {/* FILTRO */}
          {selectedRun && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
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
              <button onClick={() => loadListingsForRun(selectedRun, true)}>
                Applica
              </button>
            </div>
          )}

          {loadingListings && <p className="muted">Caricamento annunci…</p>}

          {!loadingListings && selectedRun && listings.length === 0 && (
            <p className="muted">Nessun annuncio per questa ricerca.</p>
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

          {listings.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={page === 0}
                onClick={() => {
                  setPage(page - 1);
                  loadListingsForRun(selectedRun, false);
                }}
              >
                ← Prev
              </button>
              <button
                onClick={() => {
                  setPage(page + 1);
                  loadListingsForRun(selectedRun, false);
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
