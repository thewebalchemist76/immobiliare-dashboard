import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

  const [view, setView] = useState("search"); // search | history
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");

  // ===== AUTH =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // ===== LOAD AGENCY =====
  useEffect(() => {
    if (!session) return;

    supabase
      .from("agencies")
      .select("*")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setAgency(data));
  }, [session]);

  // ===== AUTO LOAD RUNS =====
  useEffect(() => {
    if (agency && view === "history") {
      loadMyRuns();
    }
  }, [agency, view]);

  const signIn = async (email) => {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ===== LOAD RUNS =====
  const loadMyRuns = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, run_completed_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
  };

  // ===== LOAD LISTINGS BY RUN =====
  const loadListingsForRun = async (runId) => {
    setLoading(true);
    setListings([]);

    const { data: run } = await supabase
      .from("agency_runs")
      .select("run_completed_at")
      .eq("id", runId)
      .single();

    if (!run?.run_completed_at) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("agency_listings")
      .select(
        `
        listings (
          id,
          title,
          city,
          province,
          price,
          url,
          first_seen_at
        )
      `
      )
      .eq("agency_id", agency.id)
      .lte("listings.first_seen_at", run.run_completed_at)
      .order("listings.first_seen_at", { ascending: false });

    if (data) {
      setListings(data.map((r) => r.listings));
    }

    setLoading(false);
    setView("search");
  };

  // ===== LOGIN =====
  if (!session) {
    return (
      <div className="card">
        <h2>Login</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn(e.target.email.value);
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
        <p className="muted">Loggato come {session.user.email}</p>

        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button onClick={() => setView("search")}>Dashboard</button>
          <button onClick={() => setView("history")}>
            Le mie ricerche
          </button>
        </div>
      </div>

      {view === "search" && (
        <div className="card">
          <h3>Risultati</h3>

          {loading && <p className="muted">Caricamento…</p>}

          <ul className="results">
            {listings.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.title}
                </a>{" "}
                – {l.city} ({l.province}) – €{l.price}
              </li>
            ))}
          </ul>

          {!loading && listings.length === 0 && (
            <p className="muted">Nessun annuncio per questo run</p>
          )}
        </div>
      )}

      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedRunId}
            onChange={(e) => {
              const runId = e.target.value;
              setSelectedRunId(runId);
              if (runId) loadListingsForRun(runId);
            }}
          >
            <option value="">Seleziona una ricerca…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString()} –{" "}
                {r.new_listings_count} nuovi annunci
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
