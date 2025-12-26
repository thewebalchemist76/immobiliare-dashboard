import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 5000;

export default function App() {
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "https://immobiliare-backend.onrender.com";

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
  const [totalCount, setTotalCount] = useState(0);

  const [sortBy, setSortBy] = useState("price");
  const [sortDir, setSortDir] = useState("asc");

  /* ================= AUTH ================= */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => supabase.auth.signOut();

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
    if (!agency?.id) return [];
    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });
    setRuns(data || []);
    return data || [];
  };

  useEffect(() => {
    if (agency?.id) loadRuns();
  }, [agency?.id]);

  /* ================= LOAD LISTINGS ================= */
  const loadListingsForRun = async (run, resetPage = true, pageOverride = null) => {
    if (!run) return;

    setSelectedRun(run);
    if (resetPage) setPage(0);
    setLoadingListings(true);

    const { data: links } = await supabase
      .from("agency_run_listings")
      .select("listing_id")
      .eq("run_id", run.id);

    if (!links?.length) {
      setListings([]);
      setLoadingListings(false);
      return;
    }

    const ids = links.map((l) => l.listing_id);

    let countQuery = supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .in("id", ids);

    if (priceMin) countQuery = countQuery.gte("price", Number(priceMin));
    if (priceMax) countQuery = countQuery.lte("price", Number(priceMax));

    const { count } = await countQuery;
    setTotalCount(count || 0);

    let dataQuery = supabase
      .from("listings")
      .select("id, title, city, province, price, url, raw")
      .in("id", ids)
      .order(sortBy, { ascending: sortDir === "asc" });

    if (priceMin) dataQuery = dataQuery.gte("price", Number(priceMin));
    if (priceMax) dataQuery = dataQuery.lte("price", Number(priceMax));

    const effectivePage = pageOverride ?? (resetPage ? 0 : page);
    const from = effectivePage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await dataQuery.range(from, to);
    setListings(data || []);
    setLoadingListings(false);
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    if (selectedRun) loadListingsForRun(selectedRun, true, 0);
  };

  const resetFilters = () => {
    setPriceMin("");
    setPriceMax("");
    if (selectedRun) loadListingsForRun(selectedRun, true, 0);
  };

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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      {/* HEADER */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <span className="muted">{session.user.email}</span>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button onClick={() => setView("dashboard")}>Dashboard</button>
          <button onClick={() => setView("history")}>Le mie ricerche</button>
        </div>
      </div>

      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedRun?.id || ""}
            onChange={(e) => {
              const run = runs.find((r) => String(r.id) === e.target.value);
              if (run) loadListingsForRun(run, true, 0);
            }}
          >
            <option value="">Seleziona una ricerca…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString()} – {r.new_listings_count} nuovi annunci
              </option>
            ))}
          </select>

          {/* FILTRI */}
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
              <button onClick={() => loadListingsForRun(selectedRun, true, 0)}>
                Applica
              </button>
              <button onClick={resetFilters} style={{ background: "#e5e7eb", color: "#111" }}>
                Reset
              </button>
            </div>
          )}

          {/* HEADER TABELLA */}
          {listings.length > 0 && (
            <div className="table-header sticky">
              <span onClick={() => toggleSort("price")}>Annuncio</span>
              <span onClick={() => toggleSort("raw->contract->name")}>Tipo</span>
              <span onClick={() => toggleSort("raw->analytics->agencyName")}>
                Nome Agenzia / Privato
              </span>
            </div>
          )}

          <ul className="results">
            {listings.map((l) => {
              const raw = l.raw;
              const img = raw?.media?.images?.[0]?.sd;

              return (
                <li key={l.id} className="result-row">
                  {img && <img className="thumb" src={img} alt="" />}
                  <div className="table-grid-3">
                    <div>
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.title}
                      </a>{" "}
                      – {l.city} ({l.province}) – €{l.price}
                    </div>
                    <div>{raw?.contract?.name || "—"}</div>
                    <div>
                      {raw?.analytics?.agencyName ||
                        raw?.analytics?.advertiser ||
                        "—"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              disabled={page === 0}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                loadListingsForRun(selectedRun, false, p);
              }}
            >
              ← Prev
            </button>
            <span className="muted">
              Pagina {page + 1} / {totalPages}
            </span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                loadListingsForRun(selectedRun, false, p);
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
