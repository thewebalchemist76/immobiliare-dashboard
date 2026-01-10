// src/MonitorMarket.jsx
import { useEffect, useMemo, useState } from "react";

const MONITOR_WEEKS = 12;

const startOfWeekUTC = (d) => {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  const day = dt.getUTCDay();
  const diff = (day + 6) % 7;
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

  const [weekly, setWeekly] = useState([]);
  const [kpi, setKpi] = useState({ new7: 0, avg4w: 0, runs: 0 });

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
      for (const r of data || []) {
        const wk = weekKeyUTC(r.created_at);
        if (!wk) continue;
        const cur = bucket.get(wk) || { newCount: 0, runCount: 0 };
        cur.newCount += Number(r.new_listings_count || 0);
        cur.runCount += 1;
        bucket.set(wk, cur);
      }

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
      if (!ids.length) {
        setZones([]);
        setZone("");
        setZoneRows([]);
        setZoneTotals({ ok: 0, pot: 0, ver: 0, total: 0, advCounts: [] });
        return;
      }

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
      for (const x of all || []) {
        const mz = x?.raw?.analytics?.macrozone || "";
        if (mz && String(mz).trim()) zset.add(String(mz).trim());
      }
      const zlist = Array.from(zset).sort((a, b) => a.localeCompare(b, "it"));
      setZones(zlist);

      const z = zone && zset.has(zone) ? zone : zlist[0] || "";
      setZone(z);

      const inZone = z
        ? (all || []).filter((x) => String(x?.raw?.analytics?.macrozone || "").trim() === z)
        : [];

      const byAdv = new Map();
      let ok = 0,
        pot = 0,
        ver = 0;

      for (const x of inZone) {
        const adv = getAdvertiserLabel(x) || "—";
        const mz = String(x?.raw?.analytics?.macrozone || "").trim();
        const isVer = !mz;
        const isOk = !!assignMap[x.id];
        const isPot = !isOk && !isVer;

        const cur = byAdv.get(adv) || { adv, ok: 0, pot: 0, ver: 0, total: 0 };

        if (isVer) {
          cur.ver++;
          ver++;
        } else if (isOk) {
          cur.ok++;
          ok++;
        } else {
          cur.pot++;
          pot++;
        }

        cur.total++;
        byAdv.set(adv, cur);
      }

      const advCounts = Array.from(byAdv.values()).sort((a, b) => b.total - a.total);

      setZoneTotals({ ok, pot, ver, total: ok + pot + ver, advCounts });

      setZoneRows(
        advCounts.map((r) => ({
          adv: r.adv,
          ok: r.ok,
          pot: r.pot,
          ver: r.ver,
          total: r.total,
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
    const header = ["macrozone", "advertiser", "ok_assigned", "potenziale_unassigned", "da_verificare_zone_empty", "total"];
    const body = zoneRows.map((r) => [zone, r.adv, r.ok, r.pot, r.ver, r.total]);
    downloadCSV(`monitor_zone_${zone}.csv`, [header, ...body]);
  };

  useEffect(() => {
    if (!supabase || !agencyId || !isTL) return;
    loadWeekly();
    loadZonesAndZoneTable();
  }, [supabase, agencyId, isTL]);

  useEffect(() => {
    if (!supabase || !agencyId || !isTL) return;
    if (!zones.length) return;
    loadZonesAndZoneTable();
  }, [zone]);

  const weeklyMax = useMemo(
    () => Math.max(0, ...(weekly || []).map((x) => Number(x.newCount || 0))),
    [weekly]
  );

  if (!isTL) return null;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Monitor (12 settimane)</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { loadWeekly(); loadZonesAndZoneTable(); }} disabled={loading}>
            Ricarica
          </button>
          <button onClick={exportWeeklyCSV} disabled={!weekly?.length}>
            Export CSV
          </button>
        </div>
      </div>

      {err && <div className="muted" style={{ marginTop: 10 }}>Errore: {err}</div>}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
        <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
          <div className="muted" style={{ fontWeight: 700 }}>Nuovi (ultima settimana)</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{kpi.new7}</div>
        </div>
        <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
          <div className="muted" style={{ fontWeight: 700 }}>Media nuovi (ultime 4 settimane)</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{kpi.avg4w}</div>
        </div>
        <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
          <div className="muted" style={{ fontWeight: 700 }}>Run nel periodo</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{kpi.runs}</div>
        </div>
      </div>

      {/* Weekly bars */}
      <div style={{ marginTop: 18 }}>
        <div className="muted" style={{ fontWeight: 800, marginBottom: 10 }}>Nuovi annunci per settimana</div>
        <div style={{ display: "grid", gap: 10 }}>
          {weekly.map((r) => (
            <div key={r.week} style={{ display: "grid", gridTemplateColumns: "120px 1fr 60px", gap: 12, alignItems: "center" }}>
              <div className="muted" style={{ fontWeight: 700 }}>{r.week}</div>
              <Bar value={r.newCount} max={weeklyMax} />
              <div style={{ textAlign: "right", fontWeight: 800 }}>{r.newCount}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Market “excel” */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div className="muted" style={{ fontWeight: 800 }}>Mercato per Zona</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              style={{ width: 260, padding: "10px 12px", borderRadius: 12 }}
            >
              {zones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <button onClick={exportZoneCSV} disabled={!zoneRows.length}>Export CSV (Zona)</button>
          </div>
        </div>

        {/* Totali */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 14 }}>
          <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
            <div className="muted" style={{ fontWeight: 800 }}>Controllo agenzia (OK)</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{pct(zoneTotals.ok, zoneTotals.total)}%</div>
            <div className="muted" style={{ marginTop: 6 }}>{zoneTotals.ok} / {zoneTotals.total}</div>
          </div>
          <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
            <div className="muted" style={{ fontWeight: 800 }}>Potenziale (non assegnato)</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{pct(zoneTotals.pot, zoneTotals.total)}%</div>
            <div className="muted" style={{ marginTop: 6 }}>{zoneTotals.pot} / {zoneTotals.total}</div>
          </div>
          <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
            <div className="muted" style={{ fontWeight: 800 }}>Da verificare (zona vuota)</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{pct(zoneTotals.ver, zoneTotals.total)}%</div>
            <div className="muted" style={{ marginTop: 6 }}>{zoneTotals.ver} / {zoneTotals.total}</div>
          </div>
        </div>

        {/* BARRE COLORATE */}
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>OK (assegnato)</div>
            <div style={{ height: 14, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct(zoneTotals.ok, zoneTotals.total)}%`, background: "#16a34a" }} />
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Potenziale (non assegnato)</div>
            <div style={{ height: 14, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct(zoneTotals.pot, zoneTotals.total)}%`, background: "#facc15" }} />
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Da verificare (zona vuota)</div>
            <div style={{ height: 14, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct(zoneTotals.ver, zoneTotals.total)}%`, background: "#dc2626" }} />
            </div>
          </div>
        </div>

        {/* Tabella */}
        <div
          className="table-wrap"
          style={{
            marginTop: 14,
            maxHeight: "60vh",
            overflowY: "auto",
            borderRadius: 12,
          }}
        >
          <table className="crm-table">
            <thead>
              <tr>
                <th>Inserzionista</th>
                <th style={{ textAlign: "right" }}>OK</th>
                <th style={{ textAlign: "right" }}>Potenziale</th>
                <th style={{ textAlign: "right" }}>Da verificare</th>
                <th style={{ textAlign: "right" }}>Totale</th>
                <th style={{ textAlign: "right" }}>OK %</th>
                <th style={{ textAlign: "right" }}>Pot %</th>
                <th style={{ textAlign: "right" }}>Ver %</th>
              </tr>
            </thead>
            <tbody>
              {zoneRows.map((r) => (
                <tr key={r.adv}>
                  <td style={{ fontWeight: 700 }}>{r.adv}</td>
                  <td style={{ textAlign: "right", fontWeight: 800 }}>{r.ok}</td>
                  <td style={{ textAlign: "right", fontWeight: 800 }}>{r.pot}</td>
                  <td style={{ textAlign: "right", fontWeight: 800 }}>{r.ver}</td>
                  <td style={{ textAlign: "right", fontWeight: 900 }}>{r.total}</td>
                  <td style={{ textAlign: "right" }}>{r.okPct}%</td>
                  <td style={{ textAlign: "right" }}>{r.potPct}%</td>
                  <td style={{ textAlign: "right" }}>{r.verPct}%</td>
                </tr>
              ))}
              {!zoneRows.length && (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 14 }}>
                    Nessun dato per questa zona.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="muted" style={{ marginTop: 10, fontWeight: 600 }}>
          Definizioni: <b>OK</b>=assegnato, <b>Potenziale</b>=non assegnato, <b>Da verificare</b>=zona vuota.
        </div>
      </div>
    </div>
  );
}
