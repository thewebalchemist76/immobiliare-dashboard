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

  const [view, setView] = useState("dashboard"); // dashboard | history
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Dashboard run status
  const [loadingRun, setLoadingRun] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  // History “run not ready yet”
  const [runNotReady, setRunNotReady] = useState(false);
  const [runReadyMsg, setRunReadyMsg] = useState("");

  const pollRef = useRef(null);

  /* ================= AUTH ================= */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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
    if (!agency?.id) return [];

    const { data, error } = await supabase
      .from("agency_runs")
      .select("id, created_at, apify_run_id, new_listings_count, total_listings")
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
    if (agency?.id) loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency?.id]);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const getRunLinksCount = async (runId) => {
    const { count, error } = await supabase
      .from("agency_run_listings")
      .select("run_id", { count: "exact", head: true })
      .eq("run_id", runId);

    if (error) {
      console.error("getRunLinksCount:", error.message);
      return 0;
    }
    return count || 0;
  };

  const ensureRunReady = async (run, { showHistoryMsg = false } = {}) => {
    if (!run?.total_listings || run.total_listings <= 0) return true;

    const current = await getRunLinksCount(run.id);
    const ready = current >= run.total_listings;

    if (showHistoryMsg) {
      if (!ready) {
        setRunNotReady(true);
        setRunReadyMsg(
          `Caricamento in corso… (${current}/${run.total_listings})`
        );
      } else {
        setRunNotReady(false);
        setRunReadyMsg("");
      }
    }

    return ready;
  };

  const startReadyPolling = (run, { onReady, onTick } = {}) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const ok = await ensureRunReady(run, { showHistoryMsg: true });
      if (onTick) onTick();
      if (ok) {
        stopPolling();
        if (onReady) onReady();
      }
    }, POLL_INTERVAL_MS);
  };

  /* ================= START RUN (dashboard) ================= */
  const startRun = async () => {
    if (!agency?.id) return;

    setLoadingRun(true);
    setRunMsg("Ricerca in corso…");

    try {
      await fetch(`${BACKEND_URL}/run-agency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency_id: agency.id }),
      });
    } catch (e) {
      console.error("startRun:", e);
      setLoadingRun(false);
      setRunMsg("Errore avvio ricerca.");
      return;
    }

    const updated = await loadRuns();
    const latest = updated?.[0];

    if (!latest) {
      setRunMsg("Ricerca avviata…");
      return;
    }

    setRunMsg("Elaborazione annunci in corso…");

    startReadyPolling(latest, {
      onReady: async () => {
        setLoadingRun(false);
        setRunMsg("");
        await loadRuns();
      },
    });
  };

  /* ================= LOAD LISTINGS (history) ================= */
  const loadListingsForRun = async (run, resetPage = true, pageOverride = null) => {
    if (!run) return;

    setSelectedRun(run);
    setListings([]);
    setTotalCount(0);
    setLoadingListings(false);

    if (resetPage) setPage(0);

    const ready = await ensureRunReady(run, { showHistoryMsg: true });
    if (!ready) {
      setListings([]);
      setTotalCount(0);
      setLoadingListings(false);

      startReadyPolling(run, {
        onReady: async () => {
          await loadListingsForRun(run, true, 0);
        },
      });
      return;
    }

    setRunNotReady(false);
    setRunReadyMsg("");

    setLoadingListings(true);

    // 1) ids del run
    const { data: links, error: linksErr } = await supabase
      .from("agency_run_listings")
      .select("listing_id")
      .eq("run_id", run.id);

    if (linksErr) {
      console.error("linksErr:", linksErr.message);
      setLoadingListings(false);
      return;
    }

    if (!links || links.length === 0) {
      setListings([]);
      setTotalCount(0);
      setLoadingListings(false);
      return;
    }

    const listingIds = links.map((l) => l.listing_id);

    // 2) total count (con filtri prezzo)
    let countQuery = supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .in("id", listingIds);

    if (priceMin) countQuery = countQuery.gte("price", Number(priceMin));
    if (priceMax) countQuery = countQuery.lte("price", Number(priceMax));

    const { count } = await countQuery;
    setTotalCount(count || 0);

    // 3) page data  ✅ include raw
    let dataQuery = supabase
      .from("listings")
      .select("id, title, city, province, price, url, raw")
      .in("id", listingIds)
      .order("price", { ascending: true });

    if (priceMin) dataQuery = dataQuery.gte("price", Number(priceMin));
    if (priceMax) dataQuery = dataQuery.lte("price", Number(priceMax));

    const effectivePage = pageOverride !== null ? pageOverride : (resetPage ? 0 : page);
    const from = effectivePage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await dataQuery.range(from, to);

    if (error) {
      console.error("dataQuery:", error.message);
      setLoadingListings(false);
      return;
    }

    setListings(data || []);
    setLoadingListings(false);
  };

  /* ================= VIEW SWITCH ================= */
  useEffect(() => {
    if (!agency?.id) return;
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, agency?.id]);

  const signOut = async () => {
    stopPolling();
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
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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

          <button onClick={startRun} disabled={loadingRun || !agency?.id}>
            Avvia ricerca
          </button>

          {(loadingRun || runMsg) && <p className="muted">{runMsg}</p>}

          {latestRun ? (
            <p className="muted">
              Ultima ricerca: {new Date(latestRun.created_at).toLocaleString()} –{" "}
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
            </div>
          )}

          {runNotReady && <p className="muted">{runReadyMsg}</p>}
          {loadingListings && <p className="muted">Caricamento annunci…</p>}

          {!runNotReady && !loadingListings && selectedRun && listings.length === 0 && (
            <p className="muted">Nessun annuncio per questa ricerca.</p>
          )}

          <ul className="results">
            {listings.map((l) => {
              let raw = null;
              try {
                raw = l.raw ? JSON.parse(l.raw) : null;
              } catch (err) {
                console.error("raw parse error:", l.id, err);
                raw = null;
              }

              const img = raw?.media?.images?.[0]?.sd || null;

              const metaParts = [];
              const operation = raw?.contract?.name;
              const sellerType = raw?.analytics?.advertiser;
              const sellerName = raw?.analytics?.agencyName;
              const phone = raw?.contacts?.phone || raw?.contacts?.phones?.[0];

              if (operation) metaParts.push(operation);
              if (sellerType) metaParts.push(sellerType);
              if (sellerName) metaParts.push(sellerName);
              if (phone) metaParts.push(phone);

              return (
                <li key={l.id} className="result-row">
                  {img && <img className="thumb" src={img} alt="" />}

                  <div className="result-main">
                    <div className="title-line">
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.title}
                      </a>

                      <span className="right-info">
                        {l.city} ({l.province}) – €{l.price}
                      </span>

                      {metaParts.length > 0 && (
                        <span className="right-meta">{metaParts.join(" • ")}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {!runNotReady && listings.length > 0 && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                disabled={page === 0}
                onClick={() => {
                  const newPage = page - 1;
                  setPage(newPage);
                  loadListingsForRun(selectedRun, false, newPage);
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
                  const newPage = page + 1;
                  setPage(newPage);
                  loadListingsForRun(selectedRun, false, newPage);
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
