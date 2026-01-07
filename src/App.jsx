// App.jsx
import { useEffect, useRef, useState } from "react";
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

  // Notes map: { [listing_id]: note }
  const [notesByListing, setNotesByListing] = useState({});

  // Drawer dettagli
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsListing, setDetailsListing] = useState(null);

  // Drawer note state + debounce save
  const [noteDraft, setNoteDraft] = useState("");
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef("");

  const clearAuthHash = () => {
    // rimuove #access_token=... e simili senza reload
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const openDetails = (l) => {
    setDetailsListing(l);
    setDetailsOpen(true);

    const current = notesByListing?.[l.id] ?? "";
    setNoteDraft(current);
    lastSavedRef.current = current;
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsListing(null);
    setNoteDraft("");
    lastSavedRef.current = "";
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  };

  /* ================= AUTH ================= */
  useEffect(() => {
    // se arrivi da magiclink, togli hash dopo che Supabase ha letto la sessione
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      if (data.session) clearAuthHash();
    });

    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s || null);
      if (s) clearAuthHash();
    });

    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    closeDetails();
    await supabase.auth.signOut();
    clearAuthHash();
    // opzionale: riportati alla home pulita
    // window.location.assign(window.location.origin);
  };

  /* ================= AGENCY ================= */
  useEffect(() => {
    if (!session) {
      setAgency(null);
      return;
    }
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

    try {
      await fetch(`${BACKEND_URL}/run-agency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency_id: agency.id }),
      });
    } finally {
      setLoadingRun(false);
      setRunMsg("");
      loadRuns();
    }
  };

  /* ================= NOTES LOAD ================= */
  const loadNotesForListingIds = async (listingIds) => {
    if (!session?.user?.id) return;
    if (!listingIds?.length) {
      setNotesByListing({});
      return;
    }

    const { data, error } = await supabase
      .from("listing_notes")
      .select("listing_id, note")
      .eq("user_id", session.user.id)
      .in("listing_id", listingIds);

    if (error) {
      console.error("loadNotesForListingIds:", error.message);
      setNotesByListing({});
      return;
    }

    const map = {};
    (data || []).forEach((r) => {
      map[r.listing_id] = r.note || "";
    });

    setNotesByListing(map);
  };

  const upsertNote = async (listingId, note) => {
    if (!session?.user?.id || !listingId) return;

    const payload = {
      listing_id: listingId,
      user_id: session.user.id,
      note: note ?? "",
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("listing_notes").upsert(payload, {
      onConflict: "listing_id,user_id",
    });

    if (error) {
      console.error("upsertNote:", error.message);
      return;
    }

    setNotesByListing((prev) => ({ ...prev, [listingId]: note ?? "" }));
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

    if (linksErr || !links?.length) {
      setListings([]);
      setTotalCount(0);
      setNotesByListing({});
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

    const { data } = await dataQuery.range(from, to);
    const rows = data || [];
    setListings(rows);

    await loadNotesForListingIds(rows.map((x) => x.id));

    // se cambi pagina, chiudi drawer per evitare ambiguità
    if (detailsOpen && detailsListing?.id) {
      const still = rows.find((x) => x.id === detailsListing.id);
      if (!still) closeDetails();
    }
  };

  const resetFilters = () => {
    setPriceMin("");
    setPriceMax("");
    if (selectedRun) loadListingsForRun(selectedRun, true, 0);
  };

  // autosave debounce note (solo se drawer aperto)
  useEffect(() => {
    if (!detailsOpen || !detailsListing?.id) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const current = noteDraft ?? "";
      if (current === lastSavedRef.current) return;

      await upsertNote(detailsListing.id, current);
      lastSavedRef.current = current;
    }, 700);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteDraft, detailsOpen, detailsListing?.id]);

  /* ================= LOGIN (prima era nullo) ================= */
  if (!session) {
    return (
      <div className="card">
        <h2>Login</h2>
        <p className="muted">Inserisci la tua email per ricevere il magic link.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const email = e.target.email.value;
            supabase.auth.signInWithOtp({
              email,
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

  // Drawer derivati
  const dl = detailsListing;
  const dr = dl?.raw || {};
  const portal = dl?.url?.includes("immobiliare") ? "immobiliare.it" : "";
  const drawerAdvertiser = dr?.analytics?.agencyName || dr?.analytics?.advertiser || "";
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
              <button onClick={() => loadListingsForRun(selectedRun, true, 0)}>Applica</button>
              <button
                onClick={resetFilters}
                style={{ background: "#e5e7eb", color: "#111" }}
              >
                Reset
              </button>
            </div>
          )}

          {/* TABELLA */}
          <div className="table-wrap">
            <table className="crm-table">
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
                  <th>Note</th>
                  <th style={{ textAlign: "right" }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const r = l.raw || {};
                  const rowPortal = l?.url?.includes("immobiliare") ? "immobiliare.it" : "";
                  const rowAdvertiser = r?.analytics?.agencyName || r?.analytics?.advertiser || "";
                  const noteSnippet = (notesByListing?.[l.id] || "").trim();
                  return (
                    <tr key={l.id}>
                      <td>{fmtDate(l.first_seen_at)}</td>
                      <td>{fmtDate(r.lastModified * 1000)}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{safe(r.title)}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {rowPortal}{" "}
                          {l.url && (
                            <>
                              •{" "}
                              <a href={l.url} target="_blank" rel="noreferrer">
                                link
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                      <td>€ {safe(l.price)}</td>
                      <td>{safe(r.contract?.name)}</td>
                      <td>{rowAdvertiser}</td>
                      <td>{r?.geography?.street || ""}</td>
                      <td>{r?.analytics?.macrozone || ""}</td>
                      <td className="note-cell">
                        {noteSnippet ? noteSnippet : <span className="muted">—</span>}
                      </td>
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
          )}
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>

      {/* DRAWER DETTAGLI */}
      {detailsOpen && (
        <div className="drawer-overlay" onClick={closeDetails}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <div className="drawer-title">{safe(dr.title)}</div>
                <div className="drawer-subtitle">
                  {fmtDate(dl?.first_seen_at)} • {safe(dr.contract?.name)} • € {safe(dl?.price)}
                </div>
              </div>
              <button
                onClick={closeDetails}
                style={{ background: "#e5e7eb", color: "#111" }}
              >
                Chiudi
              </button>
            </div>

            {firstImg && <img src={firstImg} alt="" className="drawer-img" />}

            <div className="drawer-grid">
              <div className="kv">
                <div className="kv-label">Link</div>
                {dl?.url ? (
                  <a href={dl.url} target="_blank" rel="noreferrer">
                    {dl.url}
                  </a>
                ) : (
                  <div className="kv-value">—</div>
                )}
              </div>

              <div className="kv">
                <div className="kv-label">Agenzia / Privato</div>
                <div className="kv-value">{drawerAdvertiser || "—"}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Via</div>
                <div className="kv-value">{dr?.geography?.street || "—"}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Zona</div>
                <div className="kv-value">{dr?.analytics?.macrozone || "—"}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Note (solo questo è modificabile)</div>
                <textarea
                  className="note-textarea"
                  rows={6}
                  placeholder="Scrivi note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                />
                <div className="muted" style={{ marginTop: 6 }}>
                  Salvataggio automatico.
                </div>
              </div>

              <div className="kv">
                <div className="kv-label">Vani</div>
                <div className="kv-value">{safe(dr?.topology?.rooms, "—")}</div>
              </div>

              <div className="kv">
                <div className="kv-label">WC</div>
                <div className="kv-value">{safe(dr?.topology?.bathrooms, "—")}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Piano</div>
                <div className="kv-value">{safe(dr?.topology?.floor, "—")}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Balcone</div>
                <div className="kv-value">{dr?.topology?.balcony ? "Sì" : "—"}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Stato immobile</div>
                <div className="kv-value">{dr?.analytics?.propertyStatus || "—"}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Portale</div>
                <div className="kv-value">{portal || "—"}</div>
              </div>

              <div className="kv">
                <div className="kv-label">Data pubblicazione</div>
                <div className="kv-value">{fmtDate(dr?.creationDate * 1000)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
