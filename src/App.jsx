import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);
  const [runs, setRuns] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("search");
  const [selectedRunId, setSelectedRunId] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("agencies")
      .select("*")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setAgency(data));
  }, [session]);

  const loadRuns = async () => {
    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });
    setRuns(data || []);
  };

  const loadRunListings = async (runId) => {
    const { data } = await supabase
      .from("agency_run_listings")
      .select("listings(id,title,city,province,price,url)")
      .eq("run_id", runId);

    setListings(data.map((r) => r.listings));
  };

  if (!session) {
    return (
      <div className="card">
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
          <button>Login</button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>

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

      {view === "search" && (
        <div className="card">
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/run-agency`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ agency_id: agency.id }),
                }
              );

              setTimeout(async () => {
                await loadRuns();
                setLoading(false);
              }, 8000);
            }}
          >
            Avvia ricerca
          </button>

          <ul>
            {listings.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank">{l.title}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === "history" && (
        <div className="card">
          <select
            value={selectedRunId}
            onChange={async (e) => {
              const id = e.target.value;
              setSelectedRunId(id);
              await loadRunListings(id);
              setView("search");
            }}
          >
            <option value="">Seleziona una ricerca</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString()} –{" "}
                {r.new_listings_count} nuovi annunci
              </option>
            ))}
          </select>
        </div>
      )}

      <button onClick={() => supabase.auth.signOut()}>Logout</button>
    </div>
  );
}
