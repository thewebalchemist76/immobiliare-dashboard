// App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
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

const toISOStartOfDayUTC = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return null;
  const [y, m, d] = yyyy_mm_dd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return dt.toISOString();
};

const toISOStartOfNextDayUTC = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return null;
  const [y, m, d] = yyyy_mm_dd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  return dt.toISOString();
};

const FiltersBar = ({
  acqFrom,
  setAcqFrom,
  acqTo,
  setAcqTo,
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
  contractFilter,
  setContractFilter,
  agentFilter,
  setAgentFilter,
  advertiserFilter,
  setAdvertiserFilter,
  contractOptions,
  agencyAgents,
  advertiserOptions,
  onApply,
  onReset,
}) => {
  return (
    <div style={{ marginTop: 12 }}>
      {/* riga 1 */}
      <div
        className="filters-bar"
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div className="muted" style={{ fontWeight: 600 }}>
            Data acquisizione da
          </div>
          <input type="date" value={acqFrom} onChange={(e) => setAcqFrom(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div className="muted" style={{ fontWeight: 600 }}>
            Data acquisizione a
          </div>
          <input type="date" value={acqTo} onChange={(e) => setAcqTo(e.target.value)} />
        </div>

        <input
          placeholder="Prezzo min"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
          style={{ minWidth: 160 }}
          inputMode="numeric"
        />
        <input
          placeholder="Prezzo max"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          style={{ minWidth: 160 }}
          inputMode="numeric"
        />

        <select
          value={contractFilter}
          onChange={(e) => setContractFilter(e.target.value)}
          style={{ minWidth: 220, padding: "10px 12px", borderRadius: 12 }}
        >
          <option value="">Contratto (tutti)</option>
          {contractOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          style={{ minWidth: 260, padding: "10px 12px", borderRadius: 12 }}
        >
          <option value="">Agente (tutti)</option>
          {agencyAgents.map((a) => (
            <option key={a.user_id} value={a.user_id}>
              {a.email}
            </option>
          ))}
        </select>
      </div>

      {/* riga 2: agenzia/privato + bottoni */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <select
          value={advertiserFilter}
          onChange={(e) => setAdvertiserFilter(e.target.value)}
          style={{ minWidth: 320, padding: "10px 12px", borderRadius: 12, flex: "1 1 320px" }}
        >
          <option value="">Agenzia/Privato (tutti)</option>
          {advertiserOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
          <button onClick={onApply}>Applica</button>
          <button onClick={onReset} style={{ background: "#e5e7eb", color: "#111" }}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

const ListingsTable = ({
  listings,
  notesByListing,
  assignByListing,
  agencyAgents,
  agentEmailByUserId,
  showAgentColumn,
  agentEditable,
  onChangeAssignment,
  onOpenDetails,
  getContractName,
  getAdvertiserLabel,
}) => {
  return (
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
            const contractName = getContractName(l);
            const advLabel = getAdvertiserLabel(l);
            const noteSnippet = (notesByListing?.[l.id] || "").trim();

            const assignedUserId = assignByListing?.[l.id] || "";
            const assignedEmail = assignedUserId ? agentEmailByUserId?.[assignedUserId] : "";

            return (
              <tr key={l.id}>
                <td>{fmtDate(l.first_seen_at)}</td>
                <td>{fmtDate((r.lastModified || 0) * 1000)}</td>
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
                <td>{safe(contractName)}</td>

                {showAgentColumn && (
                  <td>
                    {agentEditable ? (
                      <select
                        value={assignedUserId}
                        onChange={(e) => onChangeAssignment(l.id, e.target.value)}
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

                <td>{advLabel}</td>
                <td>{r?.geography?.street || ""}</td>
                <td>{r?.analytics?.macrozone || ""}</td>
                <td>
                  <div className="note-cell">
                    {noteSnippet ? noteSnippet : <span className="muted">—</span>}
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn-sm" onClick={() => onOpenDetails(l)}>
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
};

export default function App() {
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "https://immobiliare-backend.onrender.com";

  const [session, setSession] = useState(null);

  // agent profile (tabella agents)
  const [agentProfile, setAgentProfile] = useState(null);
  const [agentProfileLoading, setAgentProfileLoading] = useState(true);
  const [agentProfileError, setAgentProfileError] = useState("");

  // agency
  const [agency, setAgency] = useState(null);
  const [agencyLoading, setAgencyLoading] = useState(true);

  const [view, setView] = useState("dashboard"); // dashboard | history | team | agents
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  // LISTINGS current page
  const [listings, setListings] = useState([]);

  // Pagination
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [loadingRun, setLoadingRun] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  // Notes
  const [notesByListing, setNotesByListing] = useState({});
  const [notesMetaByListing, setNotesMetaByListing] = useState({});

  // Drawer dettagli
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsListing, setDetailsListing] = useState(null);

  // Drawer note state + debounce save
  const [noteDraft, setNoteDraft] = useState("");
  const [noteReadOnly, setNoteReadOnly] = useState(false);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef("");

  // AGENTS mapping + dropdown TL
  const [agencyAgents, setAgencyAgents] = useState([]); // [{user_id,email,role}]
  const [assignByListing, setAssignByListing] = useState({}); // { [listing_id]: agent_user_id }

  // ===== TAB "AGENTI" (INVITI) =====
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  // ===== FILTRI (draft + apply) =====
  const [acqFrom, setAcqFrom] = useState(""); // yyyy-mm-dd
  const [acqTo, setAcqTo] = useState(""); // yyyy-mm-dd
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [contractFilter, setContractFilter] = useState(""); // contract name
  const [agentFilter, setAgentFilter] = useState(""); // agent_user_id
  const [advertiserFilter, setAdvertiserFilter] = useState(""); // label "Agenzia: X" / "Privato: Y"

  // cache run
  const [allRunListings, setAllRunListings] = useState([]);

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

      // 1) legacy: agents.id == auth.uid()
      let res = await tryQuery(
        supabase
          .from("agents")
          .select("id, user_id, email, role, agency_id, created_at")
          .eq("id", uid)
      );

      // 2) standard: agents.user_id == auth.uid()
      if (!res.data && !res.error) {
        res = await tryQuery(
          supabase
            .from("agents")
            .select("id, user_id, email, role, agency_id, created_at")
            .eq("user_id", uid)
        );
      }

      // 3) fallback: email
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

  /* ================= AGENCY ================= */
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

  /* ================= AGENCY AGENTS ================= */
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
  }, [agency?.id]);

  const agentEmailByUserId = useMemo(() => {
    return (agencyAgents || []).reduce((acc, a) => {
      acc[a.user_id] = a.email;
      return acc;
    }, {});
  }, [agencyAgents]);

  /* ================= HELPERS: contract + advertiser label ================= */
  const getContractName = (l) => {
    const r = l?.raw || {};
    return (
      r?.contract?.name ||
      r?.analytics?.contract ||
      (r?.contract?.id === 1 ? "Vendita" : "") ||
      ""
    );
  };

  const getAdvertiserLabel = (l) => {
    const r = l?.raw || {};
    const a = r?.analytics || {};
    const advertiser = (a?.advertiser || "").toLowerCase(); // "agenzia" / "privato"

    const agencyName =
      a?.agencyName || r?.analytics?.agencyName || r?.contacts?.agencyName || "";

    if (advertiser === "agenzia") {
      return `Agenzia: ${agencyName || "Agenzia"}`;
    }

    const privName =
      a?.advertiserName || a?.privateName || a?.ownerName || "Inserzionista privato";
    return `Privato: ${privName}`;
  };

  const contractOptions = useMemo(() => {
    const set = new Set();
    (allRunListings || []).forEach((l) => {
      const c = (getContractName(l) || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRunListings]); // eslint-disable-line react-hooks/exhaustive-deps

  const advertiserOptions = useMemo(() => {
    const set = new Set();
    (allRunListings || []).forEach((l) => {
      const v = (getAdvertiserLabel(l) || "").trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRunListings]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ================= ASSIGNMENTS ================= */
  const loadAssignmentsForListingIds = async (listingIds) => {
    if (!agency?.id) {
      setAssignByListing({});
      return {};
    }
    if (!listingIds?.length) {
      setAssignByListing({});
      return {};
    }

    const { data, error } = await supabase
      .from("listing_assignments")
      .select("listing_id, agent_user_id")
      .eq("agency_id", agency.id)
      .in("listing_id", listingIds);

    if (error) {
      console.error("loadAssignmentsForListingIds:", error.message);
      setAssignByListing({});
      return {};
    }

    const map = {};
    (data || []).forEach((r) => {
      map[r.listing_id] = r.agent_user_id;
    });

    setAssignByListing(map);
    return map;
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

  /* ================= LOAD LISTINGS (filtri + paginazione client) ================= */
  const loadListingsForRun = async (run, resetPage = true, pageOverride = null, filtersOverride = null) => {
    if (!run) return;

    setSelectedRun(run);
    if (resetPage) setPage(0);

    const f =
      filtersOverride ||
      ({
        acqFrom,
        acqTo,
        priceMin,
        priceMax,
        contractFilter,
        agentFilter,
        advertiserFilter,
      });

    const { data: links, error: linksErr } = await supabase
      .from("agency_run_listings")
      .select("listing_id")
      .eq("run_id", run.id);

    if (linksErr || !links?.length) {
      setListings([]);
      setAllRunListings([]);
      setTotalCount(0);
      setNotesByListing({});
      setNotesMetaByListing({});
      setAssignByListing({});
      return;
    }

    const ids = links.map((l) => l.listing_id);

    // 1) base query (SQL: price + first_seen_at)
    let q = supabase
      .from("listings")
      .select("id, price, url, raw, first_seen_at")
      .in("id", ids)
      .order("price", { ascending: true });

    if (f.priceMin) q = q.gte("price", Number(f.priceMin));
    if (f.priceMax) q = q.lte("price", Number(f.priceMax));

    const fromISO = toISOStartOfDayUTC(f.acqFrom);
    const toNextISO = toISOStartOfNextDayUTC(f.acqTo);
    if (fromISO) q = q.gte("first_seen_at", fromISO);
    if (toNextISO) q = q.lt("first_seen_at", toNextISO);

    const { data, error } = await q;
    if (error) {
      console.error("loadListingsForRun:", error.message);
      setListings([]);
      setAllRunListings([]);
      setTotalCount(0);
      return;
    }

    const rows = data || [];
    setAllRunListings(rows);

    // 2) assignments per tutti (serve per filtro agente)
    const assignMapAll = await (async () => {
      if (!agency?.id || !rows.length) return {};
      const { data: aData, error: aErr } = await supabase
        .from("listing_assignments")
        .select("listing_id, agent_user_id")
        .eq("agency_id", agency.id)
        .in("listing_id", rows.map((x) => x.id));

      if (aErr) {
        console.error("loadAssignments(all):", aErr.message);
        return {};
      }

      const m = {};
      (aData || []).forEach((r) => {
        m[r.listing_id] = r.agent_user_id;
      });
      return m;
    })();

    // 3) filtri client (contract + advertiser + agent)
    let filtered = rows;

    if (f.contractFilter) {
      filtered = filtered.filter((l) => (getContractName(l) || "") === f.contractFilter);
    }

    if (f.advertiserFilter) {
      filtered = filtered.filter((l) => (getAdvertiserLabel(l) || "") === f.advertiserFilter);
    }

    if (f.agentFilter) {
      filtered = filtered.filter((l) => (assignMapAll[l.id] || "") === f.agentFilter);
    }

    setTotalCount(filtered.length);

    // 4) paginate client
    const p = pageOverride ?? (resetPage ? 0 : page);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    const pageRows = filtered.slice(from, to);

    setListings(pageRows);

    // 5) assignments + notes solo pagina
    const pageListingIds = pageRows.map((x) => x.id);
    await loadAssignmentsForListingIds(pageListingIds);
    await loadNotesForListingIds(pageListingIds);

    if (detailsOpen && detailsListing?.id) {
      const still = pageRows.find((x) => x.id === detailsListing.id);
      if (!still) closeDetails();
    }
  };

  const applyFilters = () => {
    if (!selectedRun) return;
    const snapshot = {
      acqFrom,
      acqTo,
      priceMin,
      priceMax,
      contractFilter,
      agentFilter,
      advertiserFilter,
    };
    loadListingsForRun(selectedRun, true, 0, snapshot);
  };

  const resetFilters = () => {
    const empty = {
      acqFrom: "",
      acqTo: "",
      priceMin: "",
      priceMax: "",
      contractFilter: "",
      agentFilter: "",
      advertiserFilter: "",
    };

    setAcqFrom("");
    setAcqTo("");
    setPriceMin("");
    setPriceMax("");
    setContractFilter("");
    setAgentFilter("");
    setAdvertiserFilter("");

    if (selectedRun) loadListingsForRun(selectedRun, true, 0, empty);
  };

  // autosave debounce note
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
  }, [noteDraft, detailsOpen, detailsListing?.id, noteReadOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ================= TAB AGENTI: INVITA ================= */
  const inviteAgent = async () => {
    if (!isTL || !agency?.id || !inviteEmail) return;

    setInviteLoading(true);
    setInviteMsg("");

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;

      const res = await fetch(`${BACKEND_URL}/invite-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          agency_id: agency.id,
          email: inviteEmail,
          first_name: inviteFirstName,
          last_name: inviteLastName,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setInviteMsg(json?.error || "Errore invito");
      } else {
        setInviteMsg("Invito inviato.");
        setInviteEmail("");
        setInviteFirstName("");
        setInviteLastName("");
        loadAgencyAgents();
      }
    } catch (_e) {
      setInviteMsg("Errore invito");
    } finally {
      setInviteLoading(false);
    }
  };

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
  const drawerAdvertiser = (dr?.analytics?.agencyName || dr?.analytics?.advertiser || "").toString();
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
          {isTL && <button onClick={() => setView("team")}>Gestione agenti</button>}
          {isTL && <button onClick={() => setView("agents")}>Agenti</button>}
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
            <FiltersBar
              acqFrom={acqFrom}
              setAcqFrom={setAcqFrom}
              acqTo={acqTo}
              setAcqTo={setAcqTo}
              priceMin={priceMin}
              setPriceMin={setPriceMin}
              priceMax={priceMax}
              setPriceMax={setPriceMax}
              contractFilter={contractFilter}
              setContractFilter={setContractFilter}
              agentFilter={agentFilter}
              setAgentFilter={setAgentFilter}
              advertiserFilter={advertiserFilter}
              setAdvertiserFilter={setAdvertiserFilter}
              contractOptions={contractOptions}
              agencyAgents={agencyAgents}
              advertiserOptions={advertiserOptions}
              onApply={applyFilters}
              onReset={resetFilters}
            />
          )}

          <ListingsTable
            listings={listings}
            notesByListing={notesByListing}
            assignByListing={assignByListing}
            agencyAgents={agencyAgents}
            agentEmailByUserId={agentEmailByUserId}
            showAgentColumn={true}
            agentEditable={false}
            onChangeAssignment={upsertAssignment}
            onOpenDetails={openDetails}
            getContractName={getContractName}
            getAdvertiserLabel={getAdvertiserLabel}
          />

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
            <FiltersBar
              acqFrom={acqFrom}
              setAcqFrom={setAcqFrom}
              acqTo={acqTo}
              setAcqTo={setAcqTo}
              priceMin={priceMin}
              setPriceMin={setPriceMin}
              priceMax={priceMax}
              setPriceMax={setPriceMax}
              contractFilter={contractFilter}
              setContractFilter={setContractFilter}
              agentFilter={agentFilter}
              setAgentFilter={setAgentFilter}
              advertiserFilter={advertiserFilter}
              setAdvertiserFilter={setAdvertiserFilter}
              contractOptions={contractOptions}
              agencyAgents={agencyAgents}
              advertiserOptions={advertiserOptions}
              onApply={applyFilters}
              onReset={resetFilters}
            />
          )}

          <ListingsTable
            listings={listings}
            notesByListing={notesByListing}
            assignByListing={assignByListing}
            agencyAgents={agencyAgents}
            agentEmailByUserId={agentEmailByUserId}
            showAgentColumn={true}
            agentEditable={true}
            onChangeAssignment={upsertAssignment}
            onOpenDetails={openDetails}
            getContractName={getContractName}
            getAdvertiserLabel={getAdvertiserLabel}
          />

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

      {/* AGENTI (solo TL) */}
      {view === "agents" && isTL && (
        <div className="card">
          <h3>Agenti</h3>

          <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <input
              placeholder="Nome"
              value={inviteFirstName}
              onChange={(e) => setInviteFirstName(e.target.value)}
            />
            <input
              placeholder="Cognome"
              value={inviteLastName}
              onChange={(e) => setInviteLastName(e.target.value)}
            />
            <input
              placeholder="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button onClick={inviteAgent} disabled={inviteLoading || !inviteEmail}>
              {inviteLoading ? "Invio..." : "Invia invito"}
            </button>
            {inviteMsg && <div className="muted">{inviteMsg}</div>}
          </div>

          <div style={{ marginTop: 18 }}>
            <h4>Team</h4>
            <div className="muted" style={{ marginBottom: 6 }}>
              (lista dalla tabella agents)
            </div>
            <ul>
              {agencyAgents.map((a) => (
                <li key={a.user_id}>
                  {a.email} <span className="muted">({a.role})</span>
                </li>
              ))}
            </ul>
          </div>
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
                  {fmtDate(dl?.first_seen_at)} • {safe(dr?.contract?.name)} • € {safe(dl?.price)}
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
                <div className="kv-value">{fmtDate((dr?.creationDate || 0) * 1000)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
