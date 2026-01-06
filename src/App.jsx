// App.jsx
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

const safe = (v, fallback = "") => (v === null || v === undefined ? fallback : v);

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

  // Drawer dettagli
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsListing, setDetailsListing] = useState(null);

  const openDetails = (l) => {
    setDetailsListing(l);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsListing(null);
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const loadListingsForRun = async (run, resetPage = true, pageOverride = null) => {
    if (!run) return;

    setSelectedRun(run);
    if (resetPage) setPage(0);

    const { data: links, error: linksErr } = await supabase
      .from("agency_run_listings")
      .select("listing_id")
      .eq("run_id", run.id);

    if (linksErr) {
      console.error("linksErr:", linksErr.message);
      setListings([]);
      setTotalCount(0);
      return;
    }

    if (!links?.length) {
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

    const p = pageOverride ?? (resetPage ? 0 : page);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await dataQuery.range(from, to);
    if (error) {
      console.error("dataQuery:", error.message);
      setListings([]);
      return;
    }

    setListings(data || []);
  };

  const resetFilters = () => {
    setPriceMin("");
    setPriceMax("");
    if (selectedRun) loadListingsForRun(selectedRun, true, 0);
  };

  if (!session) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const dl = detailsListing;
  const dr = dl?.raw || {};
  const drawerTitle =
    dr?.title ||
    (dl ? `Annuncio #${dl.id}` : "");

  const advertiserName =
    dr?.analytics?.agencyName ||
    dr?.analytics?.advertiser ||
    "";

  const street = dr?.geography?.street || "";
  const zone = dr?.analytics?.macrozone || "";

  const portal = dl?.url?.includes("immobiliare") ? "immobiliare.it" : "";

  const contractName = dr?.contract?.name || "";

  const firstImg = dr?.media?.images?.[0]?.hd || dr?.media?.images?.[0]?.sd || "";

  return (
    <div>
      {/* HEADER */}
      <div className="card">
        <h2>
          Dashboard <span className="muted">{session.user.email}</span>
        </h2>
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
          {runMsg && <p className="muted">{runMsg}</p>}
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
              if (run) loadListingsForRun(run, true, 0);
            }}
          >
            <option value="">Seleziona…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString()} – {r.new_listings_count} nuovi
              </option>
            ))}
          </select>

          {selectedRun && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
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
            </div>
          )}

          {/* TABELLA: SOLO CAMPI FISSI + AZIONE */}
          <div className="table-wrap">
            <table className="crm-table" style={{ minWidth: 0, width: "100%" }}>
              <thead>
                <tr>
                  <th>Data acquisizione</th>
                  <th>Ultimo aggiornamento</th>
                  <th>Titolo</th>
                  <th>Prezzo</th>
                  <th>Contratto</th>
                  <th>Agenzia / Privato</th>
                  <th>Via</th>
                  <th>Zona</th>
                  <th style={{ textAlign: "right" }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const r = l.raw || {};
                  const advertiser =
                    r.analytics?.agencyName || r.analytics?.advertiser || "";
                  const via = r.geography?.street || "";
                  const zona = r.analytics?.macrozone || "";
                  return (
                    <tr key={l.id}>
                      <td>{fmtDate(l.first_seen_at)}</td>
                      <td>{fmtDate(r.lastModified * 1000)}</td>
                      <td style={{ whiteSpace: "normal" }}>
                        <div style={{ fontWeight: 600 }}>{safe(r.title, "")}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {portal} {l.url ? "•" : ""}{" "}
                          {l.url ? (
                            <a href={l.url} target="_blank" rel="noreferrer">
                              link
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td>€ {safe(l.price, "")}</td>
                      <td>{safe(r.contract?.name, "")}</td>
                      <td style={{ whiteSpace: "normal" }}>{advertiser}</td>
                      <td style={{ whiteSpace: "normal" }}>{via}</td>
                      <td style={{ whiteSpace: "normal" }}>{zona}</td>
                      <td style={{ textAlign: "right" }}>
                        <button onClick={() => openDetails(l)}>Vedi dettagli</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINAZIONE */}
          {selectedRun && (
            <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
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

      {/* DRAWER DETTAGLI (inline style, poi lo mettiamo in App.css) */}
      {detailsOpen && (
        <div
          onClick={closeDetails}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "520px",
              maxWidth: "92vw",
              background: "#fff",
              boxShadow: "-20px 0 40px rgba(0,0,0,0.15)",
              padding: 20,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{drawerTitle}</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {fmtDate(dl?.first_seen_at)} • {contractName} • € {safe(dl?.price, "")}
                </div>
              </div>
              <button onClick={closeDetails} style={{ background: "#e5e7eb", color: "#111" }}>
                Chiudi
              </button>
            </div>

            {firstImg && (
              <img
                src={firstImg}
                alt=""
                style={{
                  width: "100%",
                  height: 220,
                  objectFit: "cover",
                  borderRadius: 12,
                  marginTop: 16,
                }}
              />
            )}

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <div>
                <div className="muted">Link</div>
                {dl?.url ? (
                  <a href={dl.url} target="_blank" rel="noreferrer">
                    {dl.url}
                  </a>
                ) : (
                  <div className="muted">—</div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div className="muted">Data acquisizione</div>
                  <div>{fmtDate(dl?.first_seen_at) || "—"}</div>
                </div>
                <div>
                  <div className="muted">Ultimo aggiornamento</div>
                  <div>{fmtDate(dr?.lastModified * 1000) || "—"}</div>
                </div>
                <div>
                  <div className="muted">Data pubblicazione</div>
                  <div>{fmtDate(dr?.creationDate * 1000) || "—"}</div>
                </div>
                <div>
                  <div className="muted">Portale</div>
                  <div>{portal || "—"}</div>
                </div>
              </div>

              <div>
                <div className="muted">Agenzia / Privato</div>
                <div>{advertiserName || "—"}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div className="muted">Via</div>
                  <div>{street || "—"}</div>
                </div>
                <div>
                  <div className="muted">Zona</div>
                  <div>{zone || "—"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <div className="muted">Vani</div>
                  <div>{safe(dr?.topology?.rooms, "—")}</div>
                </div>
                <div>
                  <div className="muted">WC</div>
                  <div>{safe(dr?.topology?.bathrooms, "—")}</div>
                </div>
                <div>
                  <div className="muted">Piano</div>
                  <div>{safe(dr?.topology?.floor, "—")}</div>
                </div>
              </div>

              <div>
                <div className="muted">Balcone</div>
                <div>{dr?.topology?.balcony ? "Sì" : "—"}</div>
              </div>

              <div>
                <div className="muted">Stato immobile</div>
                <div>{safe(dr?.analytics?.propertyStatus, "—")}</div>
              </div>

              <div>
                <div className="muted">Descrizione</div>
                <div className="muted">—</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
