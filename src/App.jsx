import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentSearchId, setCurrentSearchId] = useState(null);

  const [view, setView] = useState("search"); // search | history
  const [searches, setSearches] = useState([]);
  const [selectedSearchId, setSelectedSearchId] = useState("");

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

  // ===== LOAD RESULTS =====
  const loadListings = async (searchId) => {
    const { data, error } = await supabase
      .from("search_results")
      .select("listings(id,title,city,province,price,url)")
      .eq("search_id", searchId);

    if (!error && data && data.length > 0) {
      setListings(data.map((r) => r.listings));
      return true;
    }
    return false;
  };

  // ===== LOAD MY SEARCHES =====
  const loadMySearches = async () => {
    const { data, error } = await supabase
      .from("searches")
      .select("id, created_at, query")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (!error) setSearches(data);
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
              await loadMySearches();
              setView("history");
            }}
          >
            Le mie ricerche
          </button>
        </div>
      </div>

      {/* SEARCH */}
      {view === "search" && (
        <>
          <div className="card">
            <h3>Ricerca</h3>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                setListings([]);

                const f = e.target;

                const res = await fetch(
                  `${import.meta.env.VITE_BACKEND_URL}/search`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      location_query: f.location_query.value,
                      operation: f.operation.value,
                      order: f.order.value, // 👈 NUOVO
                      min_price: Number(f.min_price.value) || null,
                      max_price: Number(f.max_price.value) || null,
                      min_rooms: Number(f.min_rooms.value) || null,
                      max_rooms: Number(f.max_rooms.value) || null,
                      min_size: Number(f.min_size.value) || null,
                      max_size: Number(f.max_size.value) || null,
                      garden: f.garden.value,
                      terrace: f.terrace.checked,
                      balcony: f.balcony.checked,
                      lift: f.lift.checked,
                      furnished: f.furnished.checked,
                      pool: f.pool.checked,
                      exclude_auctions: f.exclude_auctions.checked,
                      max_items: 2,
                      user_id: session.user.id,
                    }),
                  }
                );

                if (!res.ok) {
                  setLoading(false);
                  return;
                }

                const out = await res.json();
                setCurrentSearchId(out.searchId);

                const interval = setInterval(async () => {
                  const done = await loadListings(out.searchId);
                  if (done) {
                    clearInterval(interval);
                    setLoading(false);
                  }
                }, 5000);
              }}
            >
              <div className="search-grid">
                <input name="location_query" placeholder="Città o zona" required />

                <select name="operation">
                  <option value="vendita">Vendita</option>
                  <option value="affitto">Affitto</option>
                </select>

                {/* 👇 ORDINAMENTO */}
                <select name="order">
                  <option value="recent">Più recenti</option>
                  <option value="oldest">Meno recenti</option>
                </select>

                <input name="min_price" placeholder="Prezzo min" type="number" />
                <input name="max_price" placeholder="Prezzo max" type="number" />

                <input name="min_rooms" placeholder="Locali min" type="number" />
                <input name="max_rooms" placeholder="Locali max" type="number" />

                <input name="min_size" placeholder="Mq min" type="number" />
                <input name="max_size" placeholder="Mq max" type="number" />

                <select name="garden">
                  <option value="Indifferente">Giardino indifferente</option>
                  <option value="privato">Giardino privato</option>
                  <option value="comune">Giardino comune</option>
                </select>
              </div>

              <div className="checks">
                <label><input type="checkbox" name="terrace" /> Terrazzo</label>
                <label><input type="checkbox" name="balcony" /> Balcone</label>
                <label><input type="checkbox" name="lift" /> Ascensore</label>
                <label><input type="checkbox" name="furnished" /> Arredato</label>
                <label><input type="checkbox" name="pool" /> Piscina</label>
                <label><input type="checkbox" name="exclude_auctions" /> Escludi aste</label>
              </div>

              <button disabled={loading}>
                {loading ? "Ricerca in corso…" : "Cerca"}
              </button>
            </form>
          </div>

          <div className="card">
            <h3>Risultati</h3>
            {loading && <p className="muted">Attendo risultati da Apify…</p>}
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
        </>
      )}

      {/* HISTORY (DROPDOWN) */}
      {view === "history" && (
        <div className="card">
          <h3>Le mie ricerche</h3>

          <select
            value={selectedSearchId}
            onChange={async (e) => {
              const id = e.target.value;
              setSelectedSearchId(id);
              if (!id) return;

              setLoading(true);
              setListings([]);
              await loadListings(id);
              setCurrentSearchId(id);
              setView("search");
              setLoading(false);
            }}
          >
            <option value="">Seleziona una ricerca…</option>
            {searches.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.created_at).toLocaleString()} –{" "}
                {s.query.location_query} – {s.query.operation}
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
