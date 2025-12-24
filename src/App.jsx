import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [listings, setListings] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);

  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("search"); // search | history

  // ================= AUTH =================
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // ================= LOAD AGENCY =================
  useEffect(() => {
    if (!session) return;

    supabase
      .from("agencies")
      .select("*")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setAgency(data));
  }, [session]);

  // ================= LOAD LISTINGS =================
  const loadAgencyListings = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_listings")
      .select(
        `
        created_at,
        listings (
          id,
          title,
          city,
          province,
          price,
          url
        )
      `
      )
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    if (data) {
      setListings(
        data.map((r) => ({
          ...r.listings,
          linked_at: r.created_at,
        }))
      );
    }
  };

  // ================= LOAD RUNS =================
  const loadRuns = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("*")
      .eq("agency_id", agency.id)
      .order("run_started_at", { ascending: false });

    setRuns(data || []);
  };

  // ================= LOGIN =================
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

  // ================= UI =================
  return (
    <div>
      {/* HEADER */}
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">Loggato come {session.user.email}</p>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setView("search")}>Nuova ricerca</button>
          <button
            onClick={async () => {
              await loadRuns();
              setView("history");
            }}
          >
            Le mie ricerche
          </button>
        </div>
      </div>

      {/* SEARCH */}
      {view === "search" && (
        <div className="card">
          <h3>Ricerca</h3>
          <p className="muted">Zona assegnata all’agenzia</p>

          <button
            disabled={loading || !agency}
            onClick={async () => {
              setLoading(true);

              const res = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/run-agency`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ agency_id: agency.id }),
                }
              );

              const out = await res.json();

              await loadRuns();
              await loadAgencyListings();

              const latestRun = runs?.[0];
              setActiveRun(latestRun || null);

              setLoading(false);
            }}
          >
            {loading ? "Ricerca in corso…" : "Avvia ricerca"}
          </button>

          {/* RUN INFO */}
          {activeRun && (
            <div style={{ marginTop: 16 }}>
              <strong>
                {activeRun.new_listings_count} nuovi annunci
              </strong>
              <div className="muted">
                Run avviato il{" "}
                {new Date(activeRun.run_started_at).toLocaleString()}
              </div>
            </div>
          )}

          {/* RESULTS */}
          <h3 style={{ marginTop: 24 }}>Risultati</h3>

          <ul className="results">
            {listings.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.title}
                </a>{" "}
                – {l.city} ({l.province}) – €{l.price}
                <div className="muted">
                  Associato il {new Date(l.linked_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            onChange={async (e) => {
              const run = runs.find((r) => r.id === e.target.value);
              setActiveRun(run);
              await loadAgencyListings();
              setView("search");
            }}
          >
            <option value="">Seleziona una ricerca…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.run_started_at).toLocaleString()} –{" "}
                {r.new_listings_count} nuovi annunci
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="actions">
        <button onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>
    </div>
  );
}
