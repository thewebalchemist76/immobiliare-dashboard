// src/MonitorMarket.jsx
import { useEffect, useMemo, useState } from "react";

const MONITOR_WEEKS = 12;

const startOfWeekUTC = (d) => {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // Monday=0
  dt.setUTCDate(dt.getUTCDate() - diff);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
};

const weekKeyUTC = (d) => {
  const w = startOfWeekUTC(d);
  return w ? w.toISOString().slice(0, 10) : "";
};

const addWeeksUTC = (isoYmd, weeks) => {
  const dt = new Date(`${isoYmd}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + weeks * 7);
  return dt.toISOString().slice(0, 10);
};

const downloadCSV = (filename, rows) => {
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const pct = (n, d) => {
  const num = Number(n || 0);
  const den = Number(d || 0);
  if (!den) return 0;
  return Math.round((num / den) * 10000) / 100;
};

const Bar = ({ value, max }) => {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 12, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", borderRadius: 999, background: "#111827" }} />
    </div>
  );
};

export default function MonitorMarket({
  supabase,
  agencyId,
  isTL,
  agentEmailByUserId,
  getAdvertiserLabel,
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Weekly
  const [weekly, setWeekly] = useState([]);
  const [kpi, setKpi] = useState({ new7: 0, avg4w: 0, runs: 0 });

  // Market by zone
  const [zone, setZone] = useState("");
  const [zones, setZones] = useState([]);
  const [zoneRows, setZoneRows] = useState([]);
  const [zoneTotals, setZoneTotals] = useState({
    ok: 0,
    pot: 0,
    ver: 0,
    total: 0,
    advCounts: [],
  });

  const loadWeekly = async () => {
    if (!agencyId) return;
    setLoading(true);
    setErr("");

    try {
      const since = new Date();
      since.setDate(since.getDate() - MONITOR_WEEKS * 7 - 7);

      const { data, error } = await supabase
        .from("agency_runs")
        .select("created_at, new_listings_count")
        .eq("agency_id", agencyId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);

      const bucket = new Map();
      (data || []).forEach((r) => {
        const wk = weekKeyUTC(r.created_at);
        if (!wk) return;
        const cur = bucket.get(wk) || { newCount: 0, runCount: 0 };
        cur.newCount += Number(r.new_listings_count || 0);
        cur.runCount += 1;
        bucket.set(wk, cur);
      });

      const nowW = weekKeyUTC(new Date().toISOString());
      const startW = addWeeksUTC(nowW, -(MONITOR_WEEKS - 1));
      const out = [];

      for (let i = 0; i < MONITOR_WEEKS; i++) {
        const w = addWeeksUTC(startW, i);
        const v = bucket.get(w) || { newCount: 0, runCount: 0 };
        out.push({ week: w, newCount: v.newCount, runCount: v.runCount });
      }

      const last = out[out.length - 1]?.newCount || 0;
      const last4 = out.slice(-4);
      const avg4w = last4.reduce((s, x) => s + x.newCount, 0) / Math.max(1, last4.length);
      const runs = out.reduce((s, x) => s + x.runCount, 0);

      setWeekly(out);
      setKpi({ new7: last, avg4w: Math.round(avg4w * 10) / 10, runs });
    } catch (e) {
      setErr(e?.message || "Errore monitor");
      setWeekly([]);
      setKpi({ new7: 0, avg4w: 0, runs: 0 });
    } finally {
      setLoading(false);
    }
  };

  const exportWeeklyCSV = () => {
    const header = ["week_start_utc", "new_listings", "runs_count"];
    const body = weekly.map((r) => [r.week, r.newCount, r.runCount]);
    downloadCSV(`monitor_weekly_${agencyId || "agency"}.csv`, [header, ...body]);
  };

  const loadZonesAndZoneTable = async () => {
    if (!agencyId) return;

    setLoading(true);
    setErr("");

    try {
      const { data: links } = await supabase
        .from("agency_listings")
        .select("listing_id")
        .eq("agency_id", agencyId);

      const ids = (links || []).map((x) => x.listing_id);
      if (!ids.length) return;

      const { data: all } = await supabase
        .from("listings")
        .select("id, raw")
        .in("id", ids);

      const { data: asg } = await supabase
        .from("listing_assignments")
        .select("listing_id, agent_user_id")
        .eq("agency_id", agencyId)
        .in("listing_id", ids);

      const assignMap = {};
      (asg || []).forEach((r) => (assignMap[r.listing_id] = r.agent_user_id));

      const zset = new Set();
      (all || []).forEach((x) => {
        const mz = x?.raw?.analytics?.macrozone;
        if (mz) zset.add(String(mz).trim());
      });

      const zlist = Array.from(zset).sort((a, b) => a.localeCompare(b, "it"));
      setZones(zlist);

      const z = zone && zset.has(zone) ? zone : zlist[0] || "";
      setZone(z);

      const inZone = (all || []).filter(
        (x) => String(x?.raw?.analytics?.macrozone || "").trim() === z
      );

      const byAdv = new Map();
      let ok = 0, pot = 0, ver = 0;

      inZone.forEach((x) => {
        const adv = getAdvertiserLabel(x) || "—";
        const cur = byAdv.get(adv) || { adv, ok: 0, pot: 0, ver: 0, total: 0 };

        const mz = String(x?.raw?.analytics?.macrozone || "").trim();
        const isVer = !mz;
        const isOk = !!assignMap[x.id];
        const isPot = !isOk && !isVer;

        if (isVer) { cur.ver++; ver++; }
        else if (isOk) { cur.ok++; ok++; }
        else { cur.pot++; pot++; }

        cur.total++;
        byAdv.set(adv, cur);
      });

      const advCounts = Array.from(byAdv.values()).sort((a, b) => b.total - a.total);

      setZoneTotals({ ok, pot, ver, total: ok + pot + ver, advCounts });

      setZoneRows(
        advCounts.map((r) => ({
          ...r,
          okPct: pct(r.ok, r.total),
          potPct: pct(r.pot, r.total),
          verPct: pct(r.ver, r.total),
        }))
      );
    } catch (e) {
      setErr(e?.message || "Errore monitor");
    } finally {
      setLoading(false);
    }
  };

  const exportZoneCSV = () => {
    const header = ["macrozone", "advertiser", "ok", "potenziale", "verificare", "total"];
    const body = zoneRows.map((r) => [zone, r.adv, r.ok, r.pot, r.ver, r.total]);
    downloadCSV(`monitor_zone_${zone}.csv`, [header, ...body]);
  };

  useEffect(() => {
    if (!isTL || !agencyId) return;
    loadWeekly();
    loadZonesAndZoneTable();
  }, [agencyId, isTL]);

  useEffect(() => {
    if (!isTL || !agencyId || !zone) return;
    loadZonesAndZoneTable();
  }, [zone]);

  const weeklyMax = useMemo(
    () => Math.max(0, ...weekly.map((x) => x.newCount)),
    [weekly]
  );

  if (!isTL) return null;

  return (
    <div className="card">

      {/* === WEEKLY (invariato) === */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Monitor (12 settimane)</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { loadWeekly(); loadZonesAndZoneTable(); }} disabled={loading}>Ricarica</button>
          <button onClick={exportWeeklyCSV} disabled={!weekly.length}>Export CSV</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {weekly.map((r) => (
          <div key={r.week} style={{ display: "grid", gridTemplateColumns: "120px 1fr 60px", gap: 10 }}>
            <div>{r.week}</div>
            <Bar value={r.newCount} max={weeklyMax} />
            <div style={{ textAlign: "right" }}>{r.newCount}</div>
          </div>
        ))}
      </div>

      {/* === MERCATO PER ZONA === */}
      <div style={{ marginTop: 28 }}>
        <h4>Mercato per Zona</h4>

        <select value={zone} onChange={(e) => setZone(e.target.value)}>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>

        {/* Totali */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 16 }}>
          <div><b>OK</b><div>{zoneTotals.ok}</div></div>
          <div><b>Potenziale</b><div>{zoneTotals.pot}</div></div>
          <div><b>Da verificare</b><div>{zoneTotals.ver}</div></div>
        </div>

        {/* BARRE COLORATE */}
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div>
            <div>OK</div>
            <div style={{ height: 14, background: "#e5e7eb", borderRadius: 999 }}>
              <div style={{ width: `${pct(zoneTotals.ok, zoneTotals.total)}%`, height: "100%", background: "#16a34a", borderRadius: 999 }} />
            </div>
          </div>
          <div>
            <div>Potenziale</div>
            <div style={{ height: 14, background: "#e5e7eb", borderRadius: 999 }}>
              <div style={{ width: `${pct(zoneTotals.pot, zoneTotals.total)}%`, height: "100%", background: "#facc15", borderRadius: 999 }} />
            </div>
          </div>
          <div>
            <div>Da verificare</div>
            <div style={{ height: 14, background: "#e5e7eb", borderRadius: 999 }}>
              <div style={{ width: `${pct(zoneTotals.ver, zoneTotals.total)}%`, height: "100%", background: "#dc2626", borderRadius: 999 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
