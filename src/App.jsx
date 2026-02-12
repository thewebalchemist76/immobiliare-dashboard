// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";
import MonitorMarket from "./MonitorMarket";

const PAGE_SIZE = 20;
const NEW_DAYS = 7;

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

const downloadCSV = (filename, rows) => {
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  rightSlot,
}) => {
  return (
    <div style={{ marginTop: 12 }}>
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
          style={{
            width: 200,
            maxWidth: 200,
            minWidth: 200,
            padding: "10px 12px",
            borderRadius: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          <option value="">Agente (tutti)</option>
          {agencyAgents.map((a) => (
            <option key={a.user_id} value={a.user_id}>
              {a.email}
            </option>
          ))}
        </select>
      </div>

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
          style={{
            width: 360,
            maxWidth: 360,
            minWidth: 360,
            padding: "10px 12px",
            borderRadius: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          <option value="">Agenzia/Privato (tutti)</option>
          {advertiserOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onApply}>Applica</button>
          <button onClick={onReset} style={{ background: "#e5e7eb", color: "#111" }}>
            Reset
          </button>
        </div>
      </div>

      {rightSlot ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>{rightSlot}</div>
      ) : null}
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
  newListingIds,
}) => {
  // Online da = differenza giorni da first_seen_at (coerente con NEW badge e filtri)
  const daysOnline = (firstSeenAt) => {
    if (!firstSeenAt) return null;
    const first = new Date(firstSeenAt).getTime();
    if (!first) return null;
    const now = Date.now();
    const diff = Math.floor((now - first) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const thBase = {
    padding: "8px 10px",
    fontSize: 13,
    whiteSpace: "nowrap",
  };

  const tdBase = {
    padding: "8px 10px",
    fontSize: 13,
    verticalAlign: "top",
  };

  return (
    <div className="table-wrap">
      <table className="crm-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...thBase, width: 120 }}>Data acquisizione</th>

            {/* "Ultimo aggiornamento" commentato (non rimosso) per guadagnare spazio */}
            {/*
            <th style={{ ...thBase, width: 130 }}>Ultimo aggiornamento</th>
            */}

            <th style={{ ...thBase, width: 105, textAlign: "right" }} title="Da quanti giorni è online (dal primo rilevamento)">
              Online da
            </th>
            <th style={{ ...thBase, width: 360, whiteSpace: "normal" }}>Titolo</th>
            <th style={{ ...thBase, width: 90, textAlign: "right" }}>Prezzo</th>
            <th style={{ ...thBase, width: 120 }}>Contratto</th>
            {showAgentColumn && <th style={{ ...thBase, width: 170 }}>Agente</th>}
            <th style={{ ...thBase, width: 240, whiteSpace: "normal" }}>Agenzia / Privato</th>
            <th style={{ ...thBase, width: 220, whiteSpace: "normal" }}>Via</th>
            <th style={{ ...thBase, width: 220, whiteSpace: "normal" }}>Zona</th>
            <th style={{ ...thBase, width: 220, whiteSpace: "normal" }}>Note</th>
            <th style={{ ...thBase, width: 110, textAlign: "right" }}>Azioni</th>
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

            const isNew = !!newListingIds && newListingIds.has(l.id);
            const onlineDays = daysOnline(l.first_seen_at);

            return (
              <tr key={l.id}>
                <td style={tdBase}>{fmtDate(l.first_seen_at)}</td>

                {/* "Ultimo aggiornamento" commentato (non rimosso) */}
                {/*
                <td style={tdBase}>{fmtDate((r.lastModified || 0) * 1000)}</td>
                */}

                <td style={{ ...tdBase, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>
                  {onlineDays === null ? <span className="muted">—</span> : `${onlineDays} gg`}
                </td>
                <td style={{ ...tdBase, whiteSpace: "normal" }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{safe(r.title)}</span>
                    {isNew && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#111827",
                          color: "white",
                          letterSpacing: 0.5,
                        }}
                        title={`Nuovo negli ultimi ${NEW_DAYS} giorni`}
                      >
                        NEW
                      </span>
                    )}
                  </div>
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
                <td style={{ ...tdBase, textAlign: "right", whiteSpace: "nowrap" }}>€ {safe(l.price)}</td>
                <td style={tdBase}>{safe(contractName)}</td>

                {showAgentColumn && (
                  <td style={tdBase}>
                    {agentEditable ? (
                      <select
                        value={assignedUserId}
                        onChange={(e) => onChangeAssignment(l.id, e.target.value)}
                        style={{ padding: "8px 10px", borderRadius: 12, maxWidth: 170 }}
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

                <td style={{ ...tdBase, whiteSpace: "normal" }}>{advLabel}</td>
                <td style={{ ...tdBase, whiteSpace: "normal" }}>{r?.geography?.street || ""}</td>
                <td style={{ ...tdBase, whiteSpace: "normal" }}>{r?.analytics?.macrozone || ""}</td>
                <td style={{ ...tdBase, whiteSpace: "normal" }}>
                  <div className="note-cell">{noteSnippet ? noteSnippet : <span className="muted">—</span>}</div>
                </td>
                <td style={{ ...tdBase, textAlign: "right" }}>
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
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://immobiliare-backend.onrender.com";

  const [session, setSession] = useState(null);

  // agent profile (tabella agents)
  const [agentProfile, setAgentProfile] = useState(null);
  const [agentProfileLoading, setAgentProfileLoading] = useState(true);
  const [agentProfileError, setAgentProfileError] = useState("");

  // agencies list + selected
  const [agencies, setAgencies] = useState([]); // [{id,name}]
  const [agenciesLoading, setAgenciesLoading] = useState(true);
  const [selectedAgencyId, setSelectedAgencyId] = useState(null);

  // agency (selected)
  const [agency, setAgency] = useState(null);
  const [agencyLoading, setAgencyLoading] = useState(true);

  const [view, setView] = useState("dashboard"); // dashboard | history | team | agents | monitor
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null); // legacy (rimane)

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

  // ===== NEW badge (run-based, legacy) =====
  const [newListingIds, setNewListingIds] = useState(new Set());

  // ===== NEW badge (Annunci: ultimi 7 giorni) =====
  const [newListingIds7d, setNewListingIds7d] = useState(new Set());

  // ===== TAB "AGENTI" (INVITI) =====
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteAgencyId, setInviteAgencyId] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  // ===== FILTRI (draft + apply) =====
  const [acqFrom, setAcqFrom] = useState("");
  const [acqTo, setAcqTo] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [advertiserFilter, setAdvertiserFilter] = useState("");

  // sort (Annunci)
  const [annSort, setAnnSort] = useState("acq_desc"); // acq_desc | acq_asc | online_desc | online_asc | price_asc | price_desc | adv_asc | agent_asc | agent_desc

  // legacy cache run
  const [allRunListings, setAllRunListings] = useState([]);
  // cache annunci (tutti listing unici agenzia)
  const [allAgencyListings, setAllAgencyListings] = useState([]);

  // token anti-race (evita che una load “vecchia” sovrascriva stato dopo switch agency)
  const listingsLoadTokenRef = useRef(0);

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
        supabase.from("agents").select("id, user_id, email, role, agency_id, created_at").eq("id", uid)
      );

      // 2) standard: agents.user_id == auth.uid()
      if (!res.data && !res.error) {
        res = await tryQuery(
          supabase.from("agents").select("id, user_id, email, role, agency_id, created_at").eq("user_id", uid)
        );
      }

      // 3) fallback: email
      if (!res.data && !res.error && email) {
        res = await tryQuery(
          supabase.from("agents").select("id, user_id, email, role, agency_id, created_at").eq("email", email)
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

  const isTL = agentProfile?.role === "tl";

  /* ================= AGENCIES LIST (TL can switch) ================= */
  const loadAgencies = async () => {
    if (!session?.user?.id) {
      setAgencies([]);
      setAgenciesLoading(false);
      return;
    }

    setAgenciesLoading(true);

    const { data, error } = await supabase.from("agencies").select("id, name, active").order("created_at", {
      ascending: false,
    });

    if (error) {
      console.error("loadAgencies:", error.message);
      setAgencies([]);
      setAgenciesLoading(false);
      return;
    }

    const rows = (data || []).filter((a) => a && a.id);
    setAgencies(rows);
    setAgenciesLoading(false);

    setSelectedAgencyId((prev) => {
      if (prev && rows.some((x) => x.id === prev)) return prev;

      const preferred =
        agentProfile?.agency_id && rows.some((x) => x.id === agentProfile.agency_id) ? agentProfile.agency_id : null;
      if (preferred) return preferred;

      return rows[0]?.id || null;
    });
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    if (!agentProfileLoading) loadAgencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, agentProfileLoading]);

  useEffect(() => {
    if (!agentProfile?.agency_id) return;
    if (!isTL) setSelectedAgencyId(agentProfile.agency_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentProfile?.agency_id, isTL]);

  /* ================= RESET HARD SU SWITCH AGENCY (anti “mix annunci”) ================= */
  useEffect(() => {
    if (!selectedAgencyId) return;

    // invalida qualunque load in-flight
    listingsLoadTokenRef.current += 1;

    closeDetails();
    setSelectedRun(null);
    setRuns([]);
    setNewListingIds(new Set());
    setNewListingIds7d(new Set());
    setAllRunListings([]);
    setAllAgencyListings([]);
    setListings([]);
    setTotalCount(0);
    setPage(0);
    setNotesByListing({});
    setNotesMetaByListing({});
    setAssignByListing({});
    setAgencyAgents([]);

    // reset filtri
    setAgentFilter("");
    setContractFilter("");
    setAdvertiserFilter("");
    setPriceMin("");
    setPriceMax("");
    setAcqFrom("");
    setAcqTo("");
  }, [selectedAgencyId]);

  /* ================= AGENCY (selected) ================= */
  useEffect(() => {
    const loadAgency = async () => {
      if (!selectedAgencyId) {
        setAgency(null);
        setAgencyLoading(false);
        return;
      }

      setAgencyLoading(true);
      const { data, error } = await supabase.from("agencies").select("*").eq("id", selectedAgencyId).maybeSingle();

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
  }, [selectedAgencyId]);

  // Sync invite dropdown default
  useEffect(() => {
    if (selectedAgencyId) setInviteAgencyId(selectedAgencyId);
  }, [selectedAgencyId]);

  /* ================= RUNS (legacy, rimane) ================= */
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
    const targetAgencyId = inviteAgencyId || agency?.id;
    if (!targetAgencyId) {
      setAgencyAgents([]);
      return;
    }

    const { data, error } = await supabase
      .from("agents")
      .select("id, user_id, email, role")
      .eq("agency_id", targetAgencyId)
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
    if (inviteAgencyId || agency?.id) loadAgencyAgents();
  }, [inviteAgencyId, agency?.id]);

  const agentEmailByUserId = useMemo(() => {
    return (agencyAgents || []).reduce((acc, a) => {
      acc[a.user_id] = a.email;
      return acc;
    }, {});
  }, [agencyAgents]);

  /* ================= HELPERS: contract + advertiser label ================= */
  const getContractName = (l) => {
    const r = l?.raw || {};
    return r?.contract?.name || r?.analytics?.contract || (r?.contract?.id === 1 ? "Vendita" : "") || "";
  };

  const getAdvertiserLabel = (l) => {
    const r = l?.raw || {};
    const a = r?.analytics || {};
    const advertiser = (a?.advertiser || "").toLowerCase();

    const agencyName = a?.agencyName || r?.analytics?.agencyName || r?.contacts?.agencyName || "";

    if (advertiser === "agenzia") return `Agenzia: ${agencyName || "Agenzia"}`;

    const privName = a?.advertiserName || a?.privateName || a?.ownerName || "Inserzionista privato";
    return `Privato: ${privName}`;
  };

  const contractOptions = useMemo(() => {
    const set = new Set();
    (allRunListings || []).forEach((l) => {
      const c = (getContractName(l) || "").trim();
      if (c) set.add(c);
    });
    (allAgencyListings || []).forEach((l) => {
      const c = (getContractName(l) || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRunListings, allAgencyListings]); // eslint-disable-line react-hooks/exhaustive-deps

  const advertiserOptions = useMemo(() => {
    const set = new Set();
    (allRunListings || []).forEach((l) => {
      const v = (getAdvertiserLabel(l) || "").trim();
      if (v) set.add(v);
    });
    (allAgencyListings || []).forEach((l) => {
      const v = (getAdvertiserLabel(l) || "").trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRunListings, allAgencyListings]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ================= NEW badge legacy (run corrente vs run precedente) ================= */
  const loadNewListingsForRun = async (run) => {
    if (!run || !agency?.id) {
      setNewListingIds(new Set());
      return;
    }

    const { data: prevRun, error: prevErr } = await supabase
      .from("agency_runs")
      .select("id, created_at")
      .eq("agency_id", agency.id)
      .lt("created_at", run.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevErr) {
      console.error("load prevRun:", prevErr.message);
      setNewListingIds(new Set());
      return;
    }

    if (!prevRun) {
      const { data, error } = await supabase.from("agency_run_listings").select("listing_id").eq("run_id", run.id);
      if (error) {
        console.error("load run listings (no prev):", error.message);
        setNewListingIds(new Set());
        return;
      }
      setNewListingIds(new Set((data || []).map((r) => r.listing_id)));
      return;
    }

    const { data: current, error: curErr } = await supabase.from("agency_run_listings").select("listing_id").eq("run_id", run.id);

    if (curErr) {
      console.error("load current run listings:", curErr.message);
      setNewListingIds(new Set());
      return;
    }

    const { data: previous, error: prevListErr } = await supabase.from("agency_run_listings").select("listing_id").eq("run_id", prevRun.id);

    if (prevListErr) {
      console.error("load previous run listings:", prevListErr.message);
      setNewListingIds(new Set());
      return;
    }

    const prevSet = new Set((previous || []).map((r) => r.listing_id));
    const newOnes = new Set((current || []).map((r) => r.listing_id).filter((id) => !prevSet.has(id)));
    setNewListingIds(newOnes);
  };

  useEffect(() => {
    if (selectedRun?.id && agency?.id) loadNewListingsForRun(selectedRun);
    else setNewListingIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRun?.id, agency?.id]);

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
      const { error } = await supabase.from("listing_assignments").delete().eq("agency_id", agency.id).eq("listing_id", listingId);

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

  /* ================= LOAD ANNUNCI (agency_listings) ================= */
  const loadListingsForAgency = async (resetPage = true, pageOverride = null, filtersOverride = null, sortOverride = null) => {
    if (!agency?.id) return;

    const token = listingsLoadTokenRef.current;
    const agencyIdAtCall = agency.id;

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

    const sortKey = sortOverride || annSort;

    const { data: links, error: linksErr } = await supabase.from("agency_listings").select("listing_id").eq("agency_id", agencyIdAtCall);

    // se nel frattempo hai cambiato agenzia, ignora
    if (token !== listingsLoadTokenRef.current || agencyIdAtCall !== agency?.id) return;

    if (linksErr || !links?.length) {
      setListings([]);
      setAllAgencyListings([]);
      setTotalCount(0);
      setNotesByListing({});
      setNotesMetaByListing({});
      setAssignByListing({});
      setNewListingIds7d(new Set());
      return;
    }

    const ids = links.map((l) => l.listing_id);

    let q = supabase.from("listings").select("id, price, url, raw, first_seen_at").in("id", ids);

    if (f.priceMin) q = q.gte("price", Number(f.priceMin));
    if (f.priceMax) q = q.lte("price", Number(f.priceMax));

    const fromISO = toISOStartOfDayUTC(f.acqFrom);
    const toNextISO = toISOStartOfNextDayUTC(f.acqTo);
    if (fromISO) q = q.gte("first_seen_at", fromISO);
    if (toNextISO) q = q.lt("first_seen_at", toNextISO);

    const { data, error } = await q;

    if (token !== listingsLoadTokenRef.current || agencyIdAtCall !== agency?.id) return;

    if (error) {
      console.error("loadListingsForAgency:", error.message);
      setListings([]);
      setAllAgencyListings([]);
      setTotalCount(0);
      setNewListingIds7d(new Set());
      return;
    }

    const rows = data || [];
    setAllAgencyListings(rows);

    const cutoff = Date.now() - NEW_DAYS * 24 * 60 * 60 * 1000;
    const newSet7 = new Set(
      rows
        .filter((l) => {
          const t = l?.first_seen_at ? new Date(l.first_seen_at).getTime() : 0;
          return t && t >= cutoff;
        })
        .map((l) => l.id)
    );
    setNewListingIds7d(newSet7);

    const assignMapAll = await (async () => {
      if (!agencyIdAtCall || !rows.length) return {};
      const { data: aData, error: aErr } = await supabase
        .from("listing_assignments")
        .select("listing_id, agent_user_id")
        .eq("agency_id", agencyIdAtCall)
        .in("listing_id", rows.map((x) => x.id));

      if (aErr) {
        console.error("loadAssignments(all, agency):", aErr.message);
        return {};
      }

      const m = {};
      (aData || []).forEach((r) => {
        m[r.listing_id] = r.agent_user_id;
      });
      return m;
    })();

    if (token !== listingsLoadTokenRef.current || agencyIdAtCall !== agency?.id) return;

    let filtered = rows;
    if (f.contractFilter) filtered = filtered.filter((l) => (getContractName(l) || "") === f.contractFilter);
    if (f.advertiserFilter) filtered = filtered.filter((l) => (getAdvertiserLabel(l) || "") === f.advertiserFilter);
    if (f.agentFilter) filtered = filtered.filter((l) => (assignMapAll[l.id] || "") === f.agentFilter);

    const sortArr = [...filtered];
    const safeTime = (x) => {
      const t = x?.first_seen_at ? new Date(x.first_seen_at).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };

    const safeOnlineDays = (x) => {
      const t = safeTime(x);
      if (!t) return Number.MAX_SAFE_INTEGER; // senza data va in fondo (sia asc che desc gestito sotto)
      const diff = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
      return Math.max(0, diff);
    };

    sortArr.sort((a, b) => {
      if (sortKey === "acq_asc") return safeTime(a) - safeTime(b);
      if (sortKey === "acq_desc") return safeTime(b) - safeTime(a);

      if (sortKey === "online_asc") return safeOnlineDays(a) - safeOnlineDays(b); // più recente (meno giorni) prima
      if (sortKey === "online_desc") return safeOnlineDays(b) - safeOnlineDays(a); // più vecchio (più giorni) prima

      if (sortKey === "price_asc") return Number(a?.price ?? 0) - Number(b?.price ?? 0);
      if (sortKey === "price_desc") return Number(b?.price ?? 0) - Number(a?.price ?? 0);

      if (sortKey === "adv_asc") {
        const aa = (getAdvertiserLabel(a) || "").toString();
        const bb = (getAdvertiserLabel(b) || "").toString();
        return aa.localeCompare(bb, "it");
      }

      if (sortKey === "agent_asc" || sortKey === "agent_desc") {
        const aAgentId = assignMapAll?.[a.id] || "";
        const bAgentId = assignMapAll?.[b.id] || "";
        const aEmail = agentEmailByUserId?.[aAgentId] || "";
        const bEmail = agentEmailByUserId?.[bAgentId] || "";
        return sortKey === "agent_asc" ? aEmail.localeCompare(bEmail, "it") : bEmail.localeCompare(aEmail, "it");
      }

      return safeTime(b) - safeTime(a);
    });

    setTotalCount(sortArr.length);

    const p = pageOverride ?? (resetPage ? 0 : page);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    const pageRows = sortArr.slice(from, to);

    setListings(pageRows);

    const pageListingIds = pageRows.map((x) => x.id);
    await loadAssignmentsForListingIds(pageListingIds);
    await loadNotesForListingIds(pageListingIds);

    if (detailsOpen && detailsListing?.id) {
      const still = pageRows.find((x) => x.id === detailsListing.id);
      if (!still) closeDetails();
    }
  };

  useEffect(() => {
    if ((view === "history" || view === "team") && agency?.id) {
      loadListingsForAgency(true, 0, null, annSort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, agency?.id]);

  /* ================= LOAD LISTINGS (run: legacy) ================= */
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

    const { data: links, error: linksErr } = await supabase.from("agency_run_listings").select("listing_id").eq("run_id", run.id);

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

    let q = supabase.from("listings").select("id, price, url, raw, first_seen_at").in("id", ids).order("price", { ascending: true });

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

    let filtered = rows;
    if (f.contractFilter) filtered = filtered.filter((l) => (getContractName(l) || "") === f.contractFilter);
    if (f.advertiserFilter) filtered = filtered.filter((l) => (getAdvertiserLabel(l) || "") === f.advertiserFilter);
    if (f.agentFilter) filtered = filtered.filter((l) => (assignMapAll[l.id] || "") === f.agentFilter);

    setTotalCount(filtered.length);

    const p = pageOverride ?? (resetPage ? 0 : page);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    const pageRows = filtered.slice(from, to);

    setListings(pageRows);

    const pageListingIds = pageRows.map((x) => x.id);
    await loadAssignmentsForListingIds(pageListingIds);
    await loadNotesForListingIds(pageListingIds);

    if (detailsOpen && detailsListing?.id) {
      const still = pageRows.find((x) => x.id === detailsListing.id);
      if (!still) closeDetails();
    }
  };

  const applyFilters = () => {
    if (view === "history" || view === "team") {
      const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
      loadListingsForAgency(true, 0, snapshot, annSort);
      return;
    }

    if (!selectedRun) return;
    const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
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

    if (view === "history" || view === "team") {
      loadListingsForAgency(true, 0, empty, annSort);
      return;
    }

    if (selectedRun) loadListingsForRun(selectedRun, true, 0, empty);
  };

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
    if (!isTL || !inviteAgencyId || !inviteEmail) return;

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
          agency_id: inviteAgencyId,
          email: inviteEmail,
          first_name: inviteFirstName,
          last_name: inviteLastName,
          role: inviteRole,
        }),
      });

      const raw = await res.text();
      let json = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (_e) {
        json = null;
      }

      if (!res.ok) {
        const errVal = json?.error ?? raw ?? "Errore invito";
        const errMsg = typeof errVal === "string" ? errVal : JSON.stringify(errVal);
        setInviteMsg(errMsg || "Errore invito");
      } else {
        setInviteMsg("Invito inviato.");
        setInviteEmail("");
        setInviteFirstName("");
        setInviteLastName("");
        setInviteRole("agent");

        if (inviteAgencyId === agency?.id) loadAgencyAgents();
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

  if (agentProfileLoading || agenciesLoading || agencyLoading) {
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

  if (!agentProfile?.agency_id && !isTL) {
    return (
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>
        <p className="muted">Nessun profilo agente associato a questo account. Contatta il Team Leader.</p>
        {agentProfileError && <p className="muted">Dettaglio errore: {agentProfileError}</p>}
        <div className="actions">
          <button onClick={signOut}>Logout</button>
        </div>
      </div>
    );
  }

  if (!agency?.id) {
    return (
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>
        <p className="muted">Nessuna agenzia disponibile per questo account.</p>
        <div className="actions">
          <button onClick={signOut}>Logout</button>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setView("dashboard")}>Dashboard</button>
          <button onClick={() => setView("history")}>Annunci</button>
          {isTL && <button onClick={() => setView("team")}>Gestione agenti</button>}
          {isTL && <button onClick={() => setView("agents")}>Agenti</button>}
          {isTL && <button onClick={() => setView("monitor")}>Monitor</button>}

          {/* Dropdown agenzia (solo TL) */}
          {isTL && agencies.length > 0 && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
              <div className="muted" style={{ fontWeight: 700 }}>
                Agenzia
              </div>
              <select
                value={selectedAgencyId || ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setSelectedAgencyId(v);
                }}
                style={{ minWidth: 260, padding: "10px 12px", borderRadius: 12 }}
              >
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="muted" style={{ marginTop: 8, fontWeight: 700 }}>
          Agenzia selezionata: {agency?.name || "—"}
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

      {/* ANNUNCI */}
      {view === "history" && (
        <div className="card">
          <h3>Annunci</h3>

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
            rightSlot={
              <select
                value={annSort}
                onChange={(e) => {
                  const v = e.target.value;
                  setAnnSort(v);
                  const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
                  loadListingsForAgency(true, 0, snapshot, v);
                }}
                style={{ width: 220, maxWidth: 220, minWidth: 220, padding: "10px 12px", borderRadius: 12 }}
              >
                <option value="acq_desc">Data acquisizione ↓</option>
                <option value="acq_asc">Data acquisizione ↑</option>
                <option value="online_desc">Online da ↓</option>
                <option value="online_asc">Online da ↑</option>
                <option value="price_asc">Prezzo ↑</option>
                <option value="price_desc">Prezzo ↓</option>
                <option value="adv_asc">Agenzia / Privato A–Z</option>
                <option value="agent_asc">Agente A–Z</option>
                <option value="agent_desc">Agente Z–A</option>
              </select>
            }
          />

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
            newListingIds={newListingIds7d}
          />

          <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
            <button
              disabled={page === 0}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
                loadListingsForAgency(false, p, snapshot, annSort);
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
                const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
                loadListingsForAgency(false, p, snapshot, annSort);
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* TEAM (solo TL) */}
      {view === "team" && isTL && (
        <div className="card">
          <h3>Gestione agenti</h3>

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
            rightSlot={
              <select
                value={annSort}
                onChange={(e) => {
                  const v = e.target.value;
                  setAnnSort(v);
                  const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
                  loadListingsForAgency(true, 0, snapshot, v);
                }}
                style={{ width: 220, maxWidth: 220, minWidth: 220, padding: "10px 12px", borderRadius: 12 }}
              >
                <option value="acq_desc">Data acquisizione ↓</option>
                <option value="acq_asc">Data acquisizione ↑</option>
                <option value="online_desc">Online da ↓</option>
                <option value="online_asc">Online da ↑</option>
                <option value="price_asc">Prezzo ↑</option>
                <option value="price_desc">Prezzo ↓</option>
                <option value="adv_asc">Agenzia / Privato A–Z</option>
                <option value="agent_asc">Agente A–Z</option>
                <option value="agent_desc">Agente Z–A</option>
              </select>
            }
          />

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
            newListingIds={newListingIds7d}
          />

          <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
            <button
              disabled={page === 0}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
                loadListingsForAgency(false, p, snapshot, annSort);
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
                const snapshot = { acqFrom, acqTo, priceMin, priceMax, contractFilter, agentFilter, advertiserFilter };
                loadListingsForAgency(false, p, snapshot, annSort);
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* MONITOR (solo TL) */}
      {view === "monitor" && isTL && (
        <MonitorMarket
          supabase={supabase}
          agencyId={agency?.id}
          isTL={isTL}
          agentEmailByUserId={agentEmailByUserId}
          getAdvertiserLabel={getAdvertiserLabel}
        />
      )}

      {/* AGENTI (solo TL) */}
      {view === "agents" && isTL && (
        <div className="card">
          <h3>Agenti</h3>

          <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <select
              value={inviteAgencyId}
              onChange={(e) => setInviteAgencyId(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 12 }}
            >
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 12 }}
            >
              <option value="agent">Agente</option>
              <option value="tl">Team leader</option>
            </select>

            <input placeholder="Nome" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} />
            <input placeholder="Cognome" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} />
            <input placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />

            <button onClick={inviteAgent} disabled={inviteLoading || !inviteEmail || !inviteAgencyId}>
              {inviteLoading ? "Invio..." : "Invia invito"}
            </button>
            {inviteMsg && <div className="muted">{inviteMsg}</div>}
          </div>

          <div style={{ marginTop: 18 }}>
            <h4>Team</h4>
            <div className="muted" style={{ marginBottom: 6 }}>
              (lista dalla tabella agents per l’agenzia selezionata nel form invito)
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
