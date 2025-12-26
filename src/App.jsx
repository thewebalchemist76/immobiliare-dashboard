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
    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, apify_run_id, new_listings_count, total_listings")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });
    setRuns(data || []);
    return data || [];
  };

  useEffect(() => {
    if (agency?.id) loadRuns();
  }, [agency?.id]);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const getRunLinksCount = async (runId) => {
    const { count } = await supabase
      .from("agency_run_listings")
      .select("run_id", { count: "exact", head: true })
      .eq("run_id", runId);
    return count || 0;
  };

  const ensureRunReady = async (run, { showHistoryMsg = false } = {}) => {
    if (!run?.total_listings || run.total_listings <= 0) return true;
    const current = await getRunLinksCount(run.id);
    const ready = current >= run.total_listings;
    if (showHistoryMsg) {
      setRunNotReady(!ready);
      setRunReadyMsg(
        ready ? "" : `Caricamento in corso… (${current}/${run.total_listings})`
      );
    }
    return ready;
  };

  const startReadyPolling = (run, { onReady } = {}) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const ok = await ensureRunReady(run, { showHistoryMsg: true });
      if (ok) {
        stopPolling();
        if (onReady) onReady();
      }
    }, POLL_INTERVAL_MS);
  };

  /* ================= LOAD LISTINGS ================= */
  const loadListingsForRun = async (run, resetPage = true) => {
    if (!run) return;

    setSelectedRun(run);
    setListings([]);
    setTotalCount(0);
    if (resetPage) setPage(0);

    const ready = await ensureRunReady(run, { showHistoryMsg: true });
    if (!ready) {
      startReadyPolling(run, {
        onReady: async () => loadListingsForRun(run, true),
      });
      return;
    }

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

    const listingIds = links.map((l) => l.listing_id);

    let dataQuery = supabase
      .from("listings")
      .select("id, title, city, province, price, url, raw")
      .in("id", listingIds)
      .order("price", { ascending: true });

    if (priceMin) dataQuery = dataQuery.gte("price", Number(priceMin));
    if (priceMax) dataQuery = dataQuery.lte("price", Number(priceMax));

    const from = (resetPage ? 0 : page) * PAGE_SIZE;
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

  return (
    <div>
      <div className="card">
        <h2>Dashboard</h2>
        <button onClick={() => setView("history")}>Le mie ricerche</button>
      </div>

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
                {new Date(r.created_at).toLocaleString()} – {r.new_listings_count} nuovi annunci
              </option>
            ))}
          </select>

          <ul className="results">
            {listings.map((l) => {
              const raw = JSON.parse(l.raw);
              const img = raw.media?.images?.[0]?.sd;
              return (
                <li key={l.id} className="result-row">
                  {img && <img src={img} className="thumb" />}
                  <div>
                    <a href={l.url} target="_blank">{l.title}</a>
                    <div className="meta">
                      {raw.contract?.name} • {raw.analytics?.advertiser} • {raw.analytics?.agencyName}
                    </div>
                    <div className="desc">
                      {raw.analytics?.propertyStatus}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
