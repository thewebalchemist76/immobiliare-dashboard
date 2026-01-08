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

  // agent profile (tabella agents)
  const [agentProfile, setAgentProfile] = useState(null); // { id, user_id, role, agency_id, email }
  const [agentProfileLoading, setAgentProfileLoading] = useState(true);
  const [agentProfileError, setAgentProfileError] = useState("");

  // agency (via agentProfile.agency_id)
  const [agency, setAgency] = useState(null);
  const [agencyLoading, setAgencyLoading] = useState(true);

  const [view, setView] = useState("dashboard"); // dashboard | history | team
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [loadingRun, setLoadingRun] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  // Notes:
  // - notesByListing: testo mostrato in tabella (1 nota per annuncio = la più recente)
  // - notesMetaByListing: meta della nota mostrata (per read-only nel drawer)
  const [notesByListing, setNotesByListing] = useState({});
  const [notesMetaByListing, setNotesMetaByListing] = useState({}); // { [listing_id]: { user_id, note, updated_at } }

  // Drawer dettagli
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsListing, setDetailsListing] = useState(null);

  // Drawer note state + debounce save
  const [noteDraft, setNoteDraft] = useState("");
  const [noteReadOnly, setNoteReadOnly] = useState(false);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef("");

  // AGENTS (per mapping user_id -> email, e per dropdown TL)
  const [agencyAgents, setAgencyAgents] = useState([]); // [{user_id,email,role}]

  // ASSIGNMENTS visibili per listing nella pagina corrente
  const [assignByListing, setAssignByListing] = useState({}); // { [listing_id]: agent_user_id }

  const clearAuthHash = () => {
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const openDetails = (l) => {
    setDetailsListing(l);
    setDetailsOpen(true);

    const meta = notesMetaByListing?.[l.id] || null;
    const current = meta?.note ?? "";
    const ownerId = meta?.user_id || null;

    const ro = !!ownerId && ownerId !== session?.user?.id;
    setNoteReadOnly(ro);

    setNoteDraft(current);
    lastSavedRef.current = current;
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsListing(null);
    setNoteDraft("");
    setNoteReadOnly(false);
    lastSavedRef.current = "";
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  };

  /* ================= AUTH ================= */
  useEffect(() => {
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
  };

  /* ================= AGENT PROFILE (agents) ================= */
  useEffect(() => {
    const loadAgentProfile = async () => {
      if (!session?.user?.id) {
        setAgentProfile(null);
        setAgentProfileError("");
        setAgentProfileLoading(false);
        return;
      }

      setAgentProfileLoading(true);
      setAgentProfileError("");
      setAgentProfile(null);

      const uid = session.user.id;
      const email = session.user.email;

      const tryQuery = async (qb) => {
        const { data, error } = await qb.maybeSingle();
        if (error) return { data: null, error };
        return { data, error: null };
      };

      // 1) match legacy: agents.id == auth.uid()
      let res = await tryQuery(
        supabase
          .from("agents")
          .select("id, user_id, email, role, agency_id, created_at")
          .eq("id", uid)
      );

      // 2) match standard: agents.user_id == auth.uid()
      if (!res.data && !res.error) {
        res = await tryQuery(
          supabase
            .from("agents")
            .select("id, user_id, email, role, agency_id, created_at")
            .eq("user_id", uid)
        );
      }

      // 3) fallback: email match
      if (!res.data && !res.error && email) {
        res = await tryQuery(
          supabase
            .from("agents")
            .select("id, user_id, email, role, agency_id, created_at")
            .eq("email", email)
        );
      }

      if (res.error) {
        console.error("load agentProfile:", res.error.message);
        setAgentProfileError(res.error.message);
        setAgentProfile(null);
        setAgentProfileLoading(false);
        return;
      }

      const row = res.data || null;
      if (row && !row.user_id) row.user_id = row.id; // normalize legacy
      setAgentProfile(row);
      setAgentProfileLoading(false);
    };

    loadAgentProfile();
  }, [session?.user?.id, session?.user?.email]);

  /* ================= AGENCY (via agents.agency_id) ================= */
  useEffect(() => {
    const loadAgency = async () => {
      if (!agentProfile?.agency_id) {
        setAgency(null);
        setAgencyLoading(false);
        return;
      }

      setAgencyLoading(true);
      const { data, error } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", agentProfile.agency_id)
        .maybeSingle();

      if (error) {
        console.error("load agency:", error.message);
        setAgency(null);
        setAgencyLoading(false);
        return;
      }

      setAgency(data || null);
      setAgencyLoading(false);
    };

    loadAgency();
  }, [agentProfile?.agency_id]);

  const isTL = agentProfile?.role === "tl";

  /* ================= RUNS ================= */
  const loadRuns = async () => {
    if (!agency?.id) return;

    const { data, error } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count, total_listings")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ================= NOTES ================= */
  const loadNotesForListingIds = async (listingIds) => {
    if (!session?.user?.id) return;
    if (!listingIds?.length) {
      setNotesByListing({});
      setNotesMetaByListing({});
      return;
    }

    const { data, error } = await supabase
      .from("listing_notes")
      .select("listing_id, user_id, note, updated_at")
      .in("listing_id", listingIds)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("loadNotesForListingIds:", error.message);
      setNotesByListing({});
      setNotesMetaByListing({});
      return;
    }

    const metaMap = {};
    const textMap = {};
    (data || []).forEach((r) => {
      if (!metaMap[r.listing_id]) {
        metaMap[r.listing_id] = {
          user_id: r.user_id,
          note: r.note || "",
          updated_at: r.updated_at,
        };
        textMap[r.listing_id] = (r.note || "").trim();
      }
    });

    setNotesMetaByListing(metaMap);
    setNotesByListing(textMap);

    if (detailsOpen && detailsListing?.id) {
      const m = metaMap[detailsListing.id] || null;
      const current = m?.note ?? "";
      const ownerId = m?.user_id || null;
      const ro = !!ownerId && ownerId !== session.user.id;

      setNoteReadOnly(ro);
      setNoteDraft(current);
      lastSavedRef.current = current;
    }
  };

  const upsertNote = async (listingId, note) => {
    if (!session?.user?.id || !listingId) return;

    const meta = notesMetaByListing?.[listingId] || null;
    if (meta?.user_id && meta.user_id !== session.user.id) return;

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

    await loadNotesForListingIds(listings.map((x) => x.id));
  };

  /* ================= AGENCY AGENTS (sempre: serve mapping email) ================= */
  const loadAgencyAgents = async () => {
    if (!agency?.id) {
      setAgencyAgents([]);
      return;
    }

    const { data, error } = await supabase
      .from("agents")
      .select("id, user_id, email, role")
      .eq("agency_id", agency.id)
      .order("role", { ascending: true })
      .order("email", { ascending: true });

    if (error) {
      console.error("loadAgencyAgents:", error.message);
      setAgencyAgents([]);
      return;
    }

    const normalized = (data || [])
      .map((a) => ({
        user_id: a.user_id || a.id,
        email: a.email,
        role: a.role,
      }))
      .filter((a) => !!a.user_id);

    setAgencyAgents(normalized);
  };

  useEffect(() => {
    if (agency?.id) loadAgencyAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency?.id]);

  const agentEmailByUserId = agencyAgents.reduce((acc, a) => {
    acc[a.user_id] = a.email;
    return acc;
  }, {});

  /* ================= ASSIGNMENTS (sempre SELECT, solo TL modifica) ================= */
  const loadAssignmentsForListingIds = async (listingIds) => {
    if (!agency?.id) {
      setAssignByListing({});
      return;
    }
    if (!listingIds?.length) {
      setAssignByListing({});
      return;
    }

    const { data, error } = await supabase
      .from("listing_assignments")
      .select("listing_id, agent_user_id")
      .eq("agency_id", agency.id)
      .in("listing_id", listingIds);

    if (error) {
      console.error("loadAssignmentsForListingIds:", error.message);
      setAssignByListing({});
      return;
    }

    const map = {};
    (data || []).forEach((r) => {
      map[r.listing_id] = r.agent_user_id;
    });
    setAssignByListing(map);
  };

  const upsertAssignment = async (listingId, agentUserId) => {
    if (!isTL || !agency?.id || !session?.user?.id) return;

    if (!agentUserId) {
      const { error } = await supabase
        .from("listing_assignments")
        .delete()
        .eq("agency_id", agency.id)
        .eq("listing_id", listingId);

      if (error) {
        console.error("delete assignment:", error.message);
        return;
      }
      setAssignByListing((prev) => {
        const next = { ...prev };
        delete next[listingId];
        return next;
      });
      return;
    }

    const payload = {
      agency_id: agency.id,
      listing_id: listingId,
      agent_user_id: agentUserId,
      assigned_by: session.user.id,
      assigned_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("listing_assignments").upsert(payload, {
      onConflict: "agency_id,listing_id",
    });

    if (error) {
      console.error("upsertAssignment:", error.message);
      return;
    }

    setAssignByListing((prev) => ({ ...prev, [listingId]: agentUserId }));
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
      setNotesMetaByListing({});
      setAssignByListing({});
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
      console.error("loadListingsForRun:", error.message);
      setListings([]);
      return;
    }

    const rows = data || [];
    setListings(rows);

    const pageListingIds = rows.map((x) => x.id);

    await loadNotesForListingIds(pageListingIds);
    await loadAssignmentsForListingIds(pageListingIds);

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

  // autosave debounce note (solo se drawer aperto e non readOnly)
  useEffect(() => {
    if (!detailsOpen || !detailsListing?.id) return;
    if (noteReadOnly) return;

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
  }, [noteDraft, detailsOpen, detailsListing?.id, noteReadOnly]);

  /* ================= LOGIN ================= */
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

  // loading gate
  if (agentProfileLoading || agencyLoading) {
    return (
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>
        <p className="muted">Caricamento profilo…</p>
        {agentProfileError && <p className="muted">Errore profilo agente: {agentProfileError}</p>}
        <div className="actions">
          <button onClick={signOut}>Logout</button>
        </div>
      </div>
    );
  }

  if (!agentProfile?.agency_id) {
    return (
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>
        <p className="muted">
          Nessun profilo agente associato a questo account. Contatta il Team Leader.
        </p>
        {agentProfileError && <p className="muted">Dettaglio errore: {agentProfileError}</p>}
        <div className="actions">
          <button onClick={signOut}>Logout</button>
        </div>
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

  // showAgentColumn:
  // - history: true (read-only)
  // - team: true (editable, TL only)
  const renderListingsTable = ({ showAgentColumn, agentEditable }) => (
    <div className="table-wrap">
      <table className="crm-table">
        <thead>
          <tr>
            <th>Data acquisizione</th>
            <th>Ultimo aggiornamento</th>
            <th>Titolo</th>
            <th>Prezzo</th>
            <th>Contratto</th>
            {showAgentColumn && <th>Agente</th>}
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

            const assignedUserId = assignByListing?.[l.id] || "";
            const assignedEmail = assignedUserId ? agentEmailByUserId[assignedUserId] : "";

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

                {showAgentColumn && (
                  <td>
                    {agentEditable ? (
                      <select
                        value={assignedUserId}
                        onChange={(e) => upsertAssignment(l.id, e.target.value)}
                        style={{ padding: "10px 12px", borderRadius: 12 }}
                      >
                        <option value="">—</option>
                        {agencyAgents.map((a) => (
                          <option key={a.user_id} value={a.user_id}>
                            {a.email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="muted" style={{ fontWeight: 600 }}>
                        {assignedEmail || "—"}
                      </div>
                    )}
                  </td>
                )}

                <td>{rowAdvertiser}</td>
                <td>{r?.geography?.street || ""}</td>
                <td>{r?.analytics?.macrozone || ""}</td>
                <td>
                  <div className="note-cell">
                    {noteSnippet ? noteSnippet : <span className="muted">—</span>}
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn-sm" onClick={() => openDetails(l)}>
                    Vedi dettagli
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

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
          {isTL && <button onClick={() => setView("team")}>Gestione agenti</button>}
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
              <button onClick={resetFilters} style={{ background: "#e5e7eb", color: "#111" }}>
                Reset
              </button>
            </div>
          )}

          {/* QUI: colonna Agente sempre visibile, read-only */}
          {renderListingsTable({ showAgentColumn: true, agentEditable: false })}

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

      {/* TEAM (solo TL) */}
      {view === "team" && isTL && (
        <div className="card">
          <h3>Gestione agenti</h3>

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
              <button onClick={resetFilters} style={{ background: "#e5e7eb", color: "#111" }}>
                Reset
              </button>
            </div>
          )}

          {renderListingsTable({ showAgentColumn: true, agentEditable: true })}

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
              <button onClick={closeDetails} style={{ background: "#e5e7eb", color: "#111" }}>
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
                <div className="kv-label">Note</div>
                {noteReadOnly && (
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Nota di un altro agente (sola lettura).
                  </div>
                )}
                <textarea
                  className="note-textarea"
                  rows={6}
                  placeholder={noteReadOnly ? "Sola lettura" : "Scrivi note…"}
                  value={noteDraft}
                  readOnly={noteReadOnly}
                  onChange={(e) => {
                    if (!noteReadOnly) setNoteDraft(e.target.value);
                  }}
                />
                <div className="muted" style={{ marginTop: 6 }}>
                  {noteReadOnly ? "Non puoi modificare questa nota." : "Salvataggio automatico."}
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
