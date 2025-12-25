import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const PAGE_SIZE = 20;

export default function App() {
  const [session, setSession] = useState(null);
  const [agency, setAgency] = useState(null);

  const [view, setView] = useState("dashboard");
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRun, setSelectedRun] = useState(null);

  const [listings, setListings] = useState([]);
  const [page, setPage] = useState(0);

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);

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

  // ================= LOAD RUNS (FIX CRITICO) =================
  useEffect(() => {
    if (!agency) return;
    loadMyRuns();
  }, [agency]);

  const loadMyRuns = async () => {
    const { data } = await supabase
      .from("agency_runs")
      .select("id, created_at, run_completed_at, new_listings_count")
      .eq("agency_id", agency.id)
      .order("created_at", { ascending: false });

    setRuns(data || []);
  };

  // ================= LOAD LISTINGS =================
  const loadListingsForRun = async (runId, pageIndex = 0) => {
    setLoadingListings(true);
    setListings([]);
    setPage(pageIndex);

    const { data: run } = await supabase
      .from("agency_runs")
      .select("id, run_completed_at")
      .eq("id", runId)
      .single();

    setSelectedRun(run);

    if (!run?.run_completed_at) {
      setLoadingListings(false);
      return;
    }

    let query = supabase
      .from("agency_run_listings")
      .select(
        `
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
      .eq("run_id", runId)
      .range(
        pageIndex * PAGE_SIZE,
        pageIndex * PAGE_SIZE + PAGE_SIZE - 1
      );

    if (priceMin) query = query.gte("listings.price", Number(priceMin));
    if (priceMax) query = query.lte("listings.price", Number(priceMax));

    const { data } = await query;
    setListings(data ? data.map((r) => r.listings) : []);
    setLoadingListings(false);
  };

  // ================= RUN AGENCY =================
  const startRun = async () => {
    setLoadingRun(true);

    await fetch(`${import.meta.env.VITE_BACKEND_URL}/run-agency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id }),
    });

    await loadMyRuns();
    setLoadingRun(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
          <input name="email" />
          <button>Invia magic link</button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>Dashboard</h2>
        <p className="muted">{session.user.email}</p>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setView("dashboard")}>Dashboard</button>
          <button onClick={() => setView("history")}>Le mie ricerche</button>
        </div>
      </div>

      {view === "dashboard" && (
        <div className="card">
          <h3>Avvia ricerca</h3>

          <button onClick={startRun} disabled={loadingRun}>
            {loadingRun ? "Ricerca in corso…" : "Avvia ricerca"}
          </button>

          {runs[0] && (
            <p className="muted" style={{ marginTop: 12 }}>
              Ultima ricerca:{" "}
              {new Date(runs[0].created_at).toLocaleString()} –{" "}
              {runs[0].new_listings_count} nuovi annunci
            </p>
          )}
        </div>
      )}

      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedRunId}
            onChange={(e) => {
              setSelectedRunId(e.target.value);
              loadListingsForRun(e.target.value, 0);
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

          {selectedRun && !selectedRun.run_completed_at && (
            <p className="muted" style={{ marginTop: 12 }}>
              ⏳ Elaborazione annunci in corso…
            </p>
          )}
        </div>
      )}

      <div className="actions">
        <button onClick={signOut}>Logout</button>
      </div>
    </div>
  );
}
