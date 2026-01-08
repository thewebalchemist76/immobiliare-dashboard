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

  const [agentProfile, setAgentProfile] = useState(null);
  const [agentProfileLoading, setAgentProfileLoading] = useState(true);
  const [agentProfileError, setAgentProfileError] = useState("");

  const [agency, setAgency] = useState(null);
  const [agencyLoading, setAgencyLoading] = useState(true);

  const [view, setView] = useState("dashboard"); // dashboard | history | team | agents

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [loadingRun, setLoadingRun] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  const [agencyAgents, setAgencyAgents] = useState([]);
  const [assignByListing, setAssignByListing] = useState({});

  // ====== INVITE AGENT FORM ======
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const isTL = agentProfile?.role === "tl";

  /* ================= AUTH ================= */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s || null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  /* ================= AGENT PROFILE ================= */
  useEffect(() => {
    const loadAgentProfile = async () => {
      if (!session?.user?.id) {
        setAgentProfile(null);
        setAgentProfileLoading(false);
        return;
      }

      setAgentProfileLoading(true);
      const uid = session.user.id;
      const email = session.user.email;

      const tryQ = async (q) => {
        const { data, error } = await q.maybeSingle();
        return error ? null : data;
      };

      let row =
        (await tryQ(
          supabase.from("agents").select("*").eq("user_id", uid)
        )) ||
        (await tryQ(
          supabase.from("agents").select("*").eq("email", email)
        ));

      setAgentProfile(row || null);
      setAgentProfileLoading(false);
    };

    loadAgentProfile();
  }, [session?.user?.id]);

  /* ================= AGENCY ================= */
  useEffect(() => {
    const loadAgency = async () => {
      if (!agentProfile?.agency_id) {
        setAgency(null);
        setAgencyLoading(false);
        return;
      }

      const { data } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", agentProfile.agency_id)
        .maybeSingle();

      setAgency(data || null);
      setAgencyLoading(false);
    };

    loadAgency();
  }, [agentProfile?.agency_id]);

  /* ================= RUNS ================= */
  const loadRuns = async () => {
    if (!agency?.id) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("*")
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
    await fetch(`${BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });
    setLoadingRun(false);
    loadRuns();
  };

  /* ================= AGENCY AGENTS ================= */
  const loadAgencyAgents = async () => {
    if (!agency?.id) return;

    const { data } = await supabase
      .from("agents")
      .select("user_id,email,first_name,last_name,role")
      .eq("agency_id", agency.id)
      .order("email");

    setAgencyAgents(data || []);
  };

  useEffect(() => {
    if (agency?.id) loadAgencyAgents();
  }, [agency?.id]);

  /* ================= INVITE AGENT ================= */
  const inviteAgent = async () => {
    if (!inviteEmail || !agency?.id) return;

    setInviteLoading(true);
    setInviteMsg("");

    const { data: sess } = await supabase.auth.getSession();

    const res = await fetch(`${BACKEND_URL}/invite-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session.access_token}`,
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
      setInviteMsg(json.error || "Errore invito");
    } else {
      setInviteMsg("Invito inviato con successo.");
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      loadAgencyAgents();
    }

    setInviteLoading(false);
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

  if (agentProfileLoading || agencyLoading) {
    return <div className="card">Caricamento…</div>;
  }

  if (!agentProfile?.agency_id) {
    return (
      <div className="card">
        Nessun profilo agente associato.
        <button onClick={signOut}>Logout</button>
      </div>
    );
  }

  /* ================= UI ================= */
  return (
    <div>
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

      {view === "dashboard" && (
        <div className="card">
          <button onClick={startRun} disabled={loadingRun}>
            Avvia ricerca
          </button>
        </div>
      )}

      {/* ====== NUOVO TAB AGENTI ====== */}
      {view === "agents" && isTL && (
        <div className="card">
          <h3>Aggiungi agente</h3>

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

          <button onClick={inviteAgent} disabled={inviteLoading}>
            Invia invito
          </button>

          {inviteMsg && <p className="muted">{inviteMsg}</p>}

          <h4 style={{ marginTop: 24 }}>Team</h4>
          <ul>
            {agencyAgents.map((a) => (
              <li key={a.email}>
                {a.first_name} {a.last_name} — {a.email}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
