import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function App() {
  const [session, setSession] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

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
    await supabase.auth.signInWithOtp({ email });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ===== LOAD RESULTS =====
  const loadListings = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("listings")
      .select("id,title,city,province,price,url")
      .order("id", { ascending: false })
      .limit(50);

    if (!error) setListings(data);
    setLoading(false);
  };

  // ===== UI =====
  if (!session) {
    return (
      <div style={{ padding: 40 }}>
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
    <div style={{ padding: 40 }}>
      <h2>Dashboard</h2>
      <p>Loggato come {session.user.email}</p>

      {/* SEARCH */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);

          await fetch(`${import.meta.env.VITE_BACKEND_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              municipality: e.target.city.value,
              operation: e.target.operation.value,
              min_price: Number(e.target.min_price.value) || null,
              max_price: Number(e.target.max_price.value) || null,
              max_items: 2,
            }),
          });

          await loadListings();
        }}
      >
        <input name="city" placeholder="Città (es. Roma)" />
        <select name="operation">
          <option value="vendita">Vendita</option>
          <option value="affitto">Affitto</option>
        </select>
        <input name="min_price" placeholder="Prezzo min" />
        <input name="max_price" placeholder="Prezzo max" />
        <button>Cerca</button>
      </form>

      {/* RESULTS */}
      <h3>Risultati</h3>
      {loading && <p>Caricamento…</p>}

      <ul>
        {listings.map((l) => (
          <li key={l.id}>
            <a href={l.url} target="_blank">
              {l.title}
            </a>{" "}
            – {l.city} ({l.province}) – €{l.price}
          </li>
        ))}
      </ul>

      <button onClick={signOut}>Logout</button>
    </div>
  );
}
