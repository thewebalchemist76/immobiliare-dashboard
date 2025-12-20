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
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ===== LOAD RESULTS =====
  const loadListings = async () => {
    const { data } = await supabase
      .from("listings")
      .select("id,title,city,province,price,url")
      .order("id", { ascending: false })
      .limit(50);

    if (data) setListings(data);
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

          const f = e.target;

          await fetch(`${import.meta.env.VITE_BACKEND_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location_query: f.location_query.value,
              operation: f.operation.value,
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
          });

          await loadListings();
          setLoading(false);
        }}
      >
        <h3>Ricerca</h3>

        <input name="location_query" placeholder="Città o zona" />

        <select name="operation">
          <option value="vendita">Vendita</option>
          <option value="affitto">Affitto</option>
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

        <label><input type="checkbox" name="terrace" /> Terrazzo</label>
        <label><input type="checkbox" name="balcony" /> Balcone</label>
        <label><input type="checkbox" name="lift" /> Ascensore</label>
        <label><input type="checkbox" name="furnished" /> Arredato</label>
        <label><input type="checkbox" name="pool" /> Piscina</label>
        <label><input type="checkbox" name="exclude_auctions" /> Escludi aste</label>

        <button>Cerca</button>
      </form>

      {/* RESULTS */}
      <h3>Risultati</h3>
      {loading && <p>Caricamento…</p>}

      <ul>
        {listings.map((l) => (
          <li key={l.id}>
            <a href={l.url} target="_blank" rel="noreferrer">
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
