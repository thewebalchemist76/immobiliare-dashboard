import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
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

  const signIn = async (email) => {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ===== LOAD MY RUNS (agency_runs) =====
  const loadMyRuns = async () => {
    const { data, error } = await supabase
      .from("agency_runs")
      .select(
        `
        id,
        created_at,
        new_listings_count,
        agencies (
          name
        )
      `
      )
      .eq("agencies.user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (!error) setRuns(data || []);
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
      {/* HEADER */}
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">Loggato come {session.user.email}</p>

        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button onClick={() => setView("search")}>Nuova ricerca</button>
          <button
            onClick={async () => {
              await loadMyRuns();
              setView("history");
            }}
          >
            Le mie ricerche
          </button>
        </div>
      </div>

      {/* SEARCH (placeholder) */}
      {view === "search" && (
        <div className="card">
          <h3>Ricerca</h3>
          <p className="muted">
            La ricerca viene avviata dal pulsante “Avvia ricerca”.
          </p>
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
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
