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

  const [loadingRun, setLoadingRun] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  const pollRef = useRef(null);

  /* ================= AUTH ================= */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

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
      .select("id, created_at, new_listings_count, total_listings")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });
    setRuns(data || []);
    return data || [];
  };

  useEffect(() => {
    if (agency?.id) loadRuns();
  }, [agency?.id]);

  const getRunLinksCount = async (runId) => {
    const { count } = await supabase
      .from("agency_run_listings")
      .select("run_id", { count: "exact", head: true })
      .eq("run_id", runId);
    return count || 0;
  };

  /* ================= START RUN ================= */
  const startRun = async () => {
    if (!agency?.id) return;
    setLoadingRun(true);
    setRunMsg("Ricerca in corso…");

    await fetch(`${BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });

    const updated = await loadRuns();
    const latest = updated?.[0];
    if (!latest) return;

    const interval = setInterval(async () => {
      const ok = (await getRunLinksCount(latest.id)) >= latest.total_listings;
      if (ok) {
        clearInterval(interval);
        setLoadingRun(false);
        setRunMsg("");
        loadRuns();
      }
    }, POLL_INTERVAL_MS);
  };

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
      .order("price", { ascending: true });

    if (priceMin) dataQuery = dataQuery.gte("price", Number(priceMin));
    if (priceMax) dataQuery = dataQuery.lte("price", Number(priceMax));

    const effectivePage = pageOverride ?? (resetPage ? 0 : page);
    const from = effectivePage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await dataQuery.range(from, to);
    setListings(data || []);
    setLoadingListings(false);
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

      {view === "dashboard" && (
        <div className="card">
          <h3>Avvia ricerca</h3>
          <button onClick={startRun} disabled={loadingRun}>
            Avvia ricerca
          </button>
          {runMsg && <p className="muted">{runMsg}</p>}
        </div>
      )}

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

          <ul className="results">
            {listings.map((l) => {
              const raw = l.raw;
              const img = raw?.media?.images?.[0]?.sd;
              const meta = [
                raw?.contract?.name,
                raw?.analytics?.advertiser,
                raw?.analytics?.agencyName,
              ].filter(Boolean);

              return (
                <li key={l.id} className="result-row">
                  {img && <img className="thumb" src={img} alt="" />}
                  <div className="result-main">
                    <div className="title-line">
                      <a href={l.url} target="_blank" rel="noreferrer">{l.title}</a>
                      <span className="right-info">
                        {l.city} ({l.province}) – €{l.price}
                      </span>
                      {meta.length > 0 && (
                        <span className="right-meta">{meta.join(" • ")}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {listings.length > 0 && (
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
          )}
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
