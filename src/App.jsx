import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const PAGE_SIZE = 20;

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return dt.toLocaleDateString("it-IT");
};

export default function App() {
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "https://immobiliare-backend.onrender.com";

  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);
  const [view, setView] = useState("dashboard");

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [loadingRun, setLoadingRun] = useState(false);
  const [runMsg, setRunMsg] = useState("");

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
    if (!agency?.id) return;
    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count, total_listings")
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
    setLoadingRun(true);
    setRunMsg("Ricerca in corso…");

    await fetch(`${BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });

    setLoadingRun(false);
    setRunMsg("");
    loadRuns();
  };

  /* ================= LOAD LISTINGS ================= */
  const loadListingsForRun = async (run, resetPage = true, pageOverride = 0) => {
    if (!run) return;

    setSelectedRun(run);
    if (resetPage) setPage(0);

    const { data: links } = await supabase
      .from("agency_run_listings")
      .select("listing_id")
      .eq("run_id", run.id);

    if (!links || links.length === 0) {
      setListings([]);
      setTotalCount(0);
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
      .select("id, price, url, raw, first_seen_at")
      .in("id", ids)
      .order("price", { ascending: true });

    if (priceMin) dataQuery = dataQuery.gte("price", Number(priceMin));
    if (priceMax) dataQuery = dataQuery.lte("price", Number(priceMax));

    const from = pageOverride * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await dataQuery.range(from, to);
    setListings(data || []);
  };

  const resetFilters = () => {
    setPriceMin("");
    setPriceMax("");
    if (selectedRun) loadListingsForRun(selectedRun, true, 0);
  };

  const downloadCSV = async () => {
    if (!selectedRun) return;

    const { data: links } = await supabase
      .from("agency_run_listings")
      .select("listing_id")
      .eq("run_id", selectedRun.id);

    if (!links?.length) return;
    const ids = links.map((l) => l.listing_id);

    let q = supabase
      .from("listings")
      .select("price, url, raw, first_seen_at")
      .in("id", ids);

    if (priceMin) q = q.gte("price", Number(priceMin));
    if (priceMax) q = q.lte("price", Number(priceMax));

    const { data } = await q;
    if (!data) return;

    const headers = [
      "Data acquisizione",
      "Ultimo aggiornamento",
      "Data pubblicazione",
      "Titolo",
      "Link",
      "Prezzo",
      "Contratto",
      "Agenzia/Privato",
      "Via",
      "Zona",
    ];

    const rows = data.map((l) => {
      const r = l.raw || {};
      return [
        fmtDate(l.first_seen_at),
        fmtDate(r.lastModified * 1000),
        fmtDate(r.creationDate * 1000),
        r.title || "",
        l.url || "",
        l.price || "",
        r.contract?.name || "",
        r.analytics?.agencyName || r.analytics?.advertiser || "",
        r.geography?.street || "",
        r.analytics?.macrozone || "",
      ];
    });

    const csv =
      [headers, ...rows]
        .map((r) =>
          r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "annunci.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!session) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div className="card">
        <h2>
          Dashboard <span className="muted">{session.user.email}</span>
        </h2>
        <div style={{ display: "flex", gap: 12 }}>
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
              const run = runs.find((r) => r.id === e.target.value);
              if (run) loadListingsForRun(run, true, 0);
            }}
          >
            <option value="">Seleziona…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString()}
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
              <button
                onClick={resetFilters}
                style={{ background: "#e5e7eb", color: "#111" }}
              >
                Reset
              </button>
              <button onClick={downloadCSV}>Download CSV</button>
            </div>
          )}

          {/* QUI sotto resta la tabella CRM come già avevi */}

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
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
