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

  const signIn = async (email) => {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ===== LOAD AGENCY LISTINGS =====
  const loadAgencyListings = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_listings")
      .select("listings(id,title,city,province,price,url)")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setListings(data.map((r) => r.listings));
    }
  };

  // ===== LOAD MY RUNS =====
  const loadMyRuns = async () => {
    if (!agency) return;

    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
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

      {/* SEARCH */}
      {view === "search" && (
        <div className="card">
          <h3>Ricerca</h3>

          <p className="muted">Zona assegnata all’agenzia</p>

          <button
            disabled={loading || !agency}
            onClick={async () => {
              setLoading(true);
              setListings([]);

              await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/run-agency`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ agency_id: agency.id }),
                }
              );

              // aspettiamo Apify
              setTimeout(async () => {
                await loadAgencyListings();
                await loadMyRuns(); // ✅ QUESTA ERA LA PARTE MANCANTE
                setLoading(false);
              }, 8000);
            }}
          >
            {loading ? "Ricerca in corso…" : "Avvia ricerca"}
          </button>

          <h3 style={{ marginTop: 24 }}>Risultati</h3>

          {loading && <p className="muted">Attendo risultati…</p>}

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
