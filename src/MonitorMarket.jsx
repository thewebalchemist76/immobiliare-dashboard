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

// ===== Pie helpers (no libs) =====
const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0ea5e9",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#eab308",
  "#fb7185",
  "#14b8a6",
  "#a855f7",
];

const polarToCartesian = (cx, cy, r, angleDeg) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const describeArc = (cx, cy, r, startAngle, endAngle) => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return ["M", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y, "L", cx, cy, "Z"].join(" ");
};

const PieChart = ({ slices, size = 240 }) => {
  const total = (slices || []).reduce((s, x) => s + Number(x?.value || 0), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  if (!total) {
    return (
      <div className="muted" style={{ padding: 12 }}>
        Nessun dato per grafico.
      </div>
    );
  }

  let angle = 0;
  const paths = [];

  for (let i = 0; i < slices.length; i++) {
    const v = Number(slices[i].value || 0);
    if (v <= 0) continue;
    const sliceAngle = (v / total) * 360;
    const start = angle;
    const end = angle + sliceAngle;

    const d = describeArc(cx, cy, r, start, end);
    paths.push({ d, color: slices[i].color, label: slices[i].label, value: v });

    angle = end;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Pie chart">
      {paths.map((p, idx) => (
        <path key={`${p.label}-${idx}`} d={p.d} fill={p.color} stroke="white" strokeWidth="2" />
      ))}
    </svg>
  );
};

// ===== Median + Month helpers (no libs) =====
const median = (arr) => {
  const a = (arr || []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (!a.length) return null;
  a.sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 1) return a[mid];
  return (a[mid - 1] + a[mid]) / 2;
};

const monthKeyUTCFromTs = (ts) => {
  if (!ts) return "";
  const dt = new Date(ts);
  if (isNaN(dt)) return "";
  return dt.toISOString().slice(0, 7); // YYYY-MM
};

const fmtMoney = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT").format(Math.round(n));
};

const fmtMonthLabel = (ym) => {
  // ym: "YYYY-MM"
  const [y, m] = String(ym || "").split("-");
  if (!y || !m) return ym || "";
  return `${m}/${y}`;
};

const VerticalBars = ({
  title,
  subtitle,
  data,
  valueKey,
  labelKey = "month",
  height = 260,
  yFormatter,
}) => {
  const W = 900;
  const H = height;
  const padL = 46;
  const padR = 16;
  const padT = 18;
  const padB = 42;

  const values = (data || []).map((d) => Number(d?.[valueKey] || 0)).filter((x) => Number.isFinite(x) && x > 0);
  const maxV = values.length ? Math.max(...values) : 0;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = (data || []).length;
  const gap = 10;
  const barW = n > 0 ? Math.max(10, Math.floor((innerW - gap * (n - 1)) / n)) : 10;

  const yTicks = maxV > 0 ? [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(maxV * p)) : [0];

  return (
    <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div className="muted" style={{ fontWeight: 700 }}>
          {subtitle || ""}
        </div>
      </div>

      {!n || !maxV ? (
        <div className="muted" style={{ marginTop: 10 }}>
          Nessun dato per grafico.
        </div>
      ) : (
        <div style={{ marginTop: 10, width: "100%", overflowX: "auto" }}>
          <svg
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={title}
            style={{ display: "block", minWidth: 640 }}
          >
            {/* Y grid + labels */}
            {yTicks.map((tv, i) => {
              const y = padT + innerH - (maxV ? (tv / maxV) * innerH : 0);
              return (
                <g key={`yt-${i}`}>
                  <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6b7280">
                    {yFormatter ? yFormatter(tv) : tv}
                  </text>
                </g>
              );
            })}

            {/* X axis */}
            <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke="#9ca3af" strokeWidth="1" />

            {/* Bars */}
            {data.map((d, idx) => {
              const v = Number(d?.[valueKey] || 0);
              const x = padL + idx * (barW + gap);
              const h = maxV ? (Math.max(0, v) / maxV) * innerH : 0;
              const y = padT + innerH - h;

              const label = fmtMonthLabel(d?.[labelKey]);
              const tooltip = `${label}: ${yFormatter ? yFormatter(v) : v}`;

              return (
                <g key={`bar-${idx}`}>
                  <rect x={x} y={y} width={barW} height={h} rx="8" ry="8" fill="#111827">
                    <title>{tooltip}</title>
                  </rect>

                  {/* X labels (every bar, compact) */}
                  <text
                    x={x + barW / 2}
                    y={padT + innerH + 24}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#6b7280"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div className="muted" style={{ marginTop: 8, fontWeight: 600 }}>
        (mediana mensile)
      </div>
    </div>
  );
};

export default function MonitorMarket({ supabase, agencyId, isTL, agentEmailByUserId, getAdvertiserLabel }) {
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

  // ===== listings della zona (per grafici prezzo) =====
  const [zoneListings, setZoneListings] = useState([]);

  // ================= SORT (Inserzionisti) =================
  // default: Totale desc (come prima)
  const [advSortKey, setAdvSortKey] = useState("total"); // adv | ok | pot | ver | total | okPct | potPct | verPct | penPct
  const [advSortDir, setAdvSortDir] = useState("desc"); // asc | desc

  const toggleSort = (key) => {
    setAdvSortKey((prevKey) => {
      if (prevKey !== key) {
        setAdvSortDir(key === "adv" ? "asc" : "desc");
        return key;
      }
      setAdvSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      return prevKey;
    });
  };

  const sortIndicator = (key) => {
    if (advSortKey !== key) return "";
    return advSortDir === "asc" ? " ↑" : " ↓";
  };

  const sortedZoneRows = useMemo(() => {
    const rows = [...(zoneRows || [])];
    const dir = advSortDir === "asc" ? 1 : -1;

    const cmpNum = (a, b) => {
      const aa = Number(a || 0);
      const bb = Number(b || 0);
      if (aa < bb) return -1 * dir;
      if (aa > bb) return 1 * dir;
      return 0;
    };

    const cmpStr = (a, b) => {
      const aa = (a || "").toString();
      const bb = (b || "").toString();
      return aa.localeCompare(bb, "it") * dir;
    };

    rows.sort((a, b) => {
      switch (advSortKey) {
        case "adv":
          return cmpStr(a.adv, b.adv);
        case "ok":
          return cmpNum(a.ok, b.ok);
        case "pot":
          return cmpNum(a.pot, b.pot);
        case "ver":
          return cmpNum(a.ver, b.ver);
        case "total":
          return cmpNum(a.total, b.total);
        case "okPct":
          return cmpNum(a.okPct, b.okPct);
        case "potPct":
          return cmpNum(a.potPct, b.potPct);
        case "verPct":
          return cmpNum(a.verPct, b.verPct);
        case "penPct":
          return cmpNum(a.penPct, b.penPct);
        default:
          return cmpNum(a.total, b.total);
      }
    });

    return rows;
  }, [zoneRows, advSortKey, advSortDir]);

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
      const { data: links } = await supabase.from("agency_listings").select("listing_id").eq("agency_id", agencyId);

      const ids = (links || []).map((x) => x.listing_id);
      if (!ids.length) {
        setZones([]);
        setZone("");
        setZoneRows([]);
        setZoneTotals({ ok: 0, pot: 0, ver: 0, total: 0, advCounts: [] });
        setZoneListings([]);
        return;
      }

      const { data: all } = await supabase.from("listings").select("id, raw, price, first_seen_at").in("id", ids);

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

      const inZone = z ? (all || []).filter((x) => String(x?.raw?.analytics?.macrozone || "").trim() === z) : [];

      // salva anche per grafici prezzo
      setZoneListings(inZone);

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

      const zoneTotal = ok + pot + ver;

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
          penPct: pct(r.total, zoneTotal), // penetrazione: quota sul totale zona
        }))
      );

      // reset sort default (mantiene comportamento vecchio)
      setAdvSortKey("total");
      setAdvSortDir("desc");
    } catch (e) {
      setErr(e?.message || "Errore monitor");
    } finally {
      setLoading(false);
    }
  };

  const exportZoneCSV = () => {
    const header = [
      "macrozone",
      "advertiser",
      "ok_assigned",
      "potenziale_unassigned",
      "da_verificare_zone_empty",
      "total",
      "penetration_pct",
    ];
    const body = zoneRows.map((r) => [zone, r.adv, r.ok, r.pot, r.ver, r.total, r.penPct]);
    downloadCSV(`monitor_zone_${zone}.csv`, [header, ...body]);
  };

  useEffect(() => {
    if (!supabase || !agencyId || !isTL) return;
    loadWeekly();
    loadZonesAndZoneTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, agencyId, isTL]);

  useEffect(() => {
    if (!supabase || !agencyId || !isTL) return;
    if (!zones.length) return;
    loadZonesAndZoneTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);

  const weeklyMax = useMemo(() => Math.max(0, ...(weekly || []).map((x) => Number(x.newCount || 0))), [weekly]);

  // ===== Pie + Top10 data =====
  const pieAndTop = useMemo(() => {
    const zoneTotal = Number(zoneTotals?.total || 0);
    const base = [...(zoneRows || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

    const TOP_N = 10;
    const PIE_N = 12;

    const top10 = base.slice(0, TOP_N).map((r) => ({
      adv: r.adv,
      total: r.total,
      penPct: pct(r.total, zoneTotal),
    }));

    const pieBase = base.slice(0, PIE_N);
    const rest = base.slice(PIE_N);

    const slices = pieBase.map((r, idx) => ({
      label: r.adv,
      value: Number(r.total || 0),
      color: PIE_COLORS[idx % PIE_COLORS.length],
    }));

    const restSum = rest.reduce((s, x) => s + Number(x.total || 0), 0);
    if (restSum > 0) {
      slices.push({
        label: "Altri",
        value: restSum,
        color: "#9ca3af",
      });
    }

    return { slices, top10 };
  }, [zoneRows, zoneTotals?.total]);

  // ===== Prezzi: mediana per mese (prezzo e €/mq) =====
  const priceMonthly = useMemo(() => {
    const bucket = new Map(); // ym -> { prices: [], eurMq: [] }

    for (const x of zoneListings || []) {
      const ym = monthKeyUTCFromTs(x?.first_seen_at);
      if (!ym) continue;

      const p = Number(x?.price ?? x?.raw?.price?.raw);
      if (!Number.isFinite(p) || p <= 0) continue;

      const sqm = Number(x?.raw?.topology?.surface?.size);
      const eurMq = Number.isFinite(sqm) && sqm > 0 ? p / sqm : null;

      const cur = bucket.get(ym) || { month: ym, prices: [], eurMq: [] };
      cur.prices.push(p);
      if (eurMq && Number.isFinite(eurMq) && eurMq > 0) cur.eurMq.push(eurMq);
      bucket.set(ym, cur);
    }

    const out = Array.from(bucket.values())
      .map((b) => ({
        month: b.month,
        medianPrice: median(b.prices),
        medianEurMq: b.eurMq.length ? median(b.eurMq) : null,
        n: (b.prices || []).length,
      }))
      .filter((r) => r.medianPrice !== null)
      .sort((a, b) => String(a.month).localeCompare(String(b.month)));

    return out;
  }, [zoneListings]);

  if (!isTL) return null;

  const Th = ({ k, children, alignRight = false }) => (
    <th
      onClick={() => toggleSort(k)}
      title="Ordina"
      style={{
        cursor: "pointer",
        userSelect: "none",
        textAlign: alignRight ? "right" : "left",
        whiteSpace: "nowrap",
      }}
    >
      {children}
      <span className="muted" style={{ fontWeight: 900 }}>
        {sortIndicator(k)}
      </span>
    </th>
  );

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Monitor (12 settimane)</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              loadWeekly();
              loadZonesAndZoneTable();
            }}
            disabled={loading}
          >
            Ricarica
          </button>
          <button onClick={exportWeeklyCSV} disabled={!weekly?.length}>
            Export CSV
          </button>
        </div>
      </div>

      {err && (
        <div className="muted" style={{ marginTop: 10 }}>
          Errore: {err}
        </div>
      )}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
        <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
          <div className="muted" style={{ fontWeight: 700 }}>
            Nuovi (ultima settimana)
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{kpi.new7}</div>
        </div>
        <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
          <div className="muted" style={{ fontWeight: 700 }}>
            Media nuovi (ultime 4 settimane)
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{kpi.avg4w}</div>
        </div>
        <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
          <div className="muted" style={{ fontWeight: 700 }}>
            Run nel periodo
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{kpi.runs}</div>
        </div>
      </div>

      {/* Weekly bars */}
      <div style={{ marginTop: 18 }}>
        <div className="muted" style={{ fontWeight: 800, marginBottom: 10 }}>
          Nuovi annunci per settimana
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {weekly.map((r) => (
            <div
              key={r.week}
              style={{ display: "grid", gridTemplateColumns: "120px 1fr 60px", gap: 12, alignItems: "center" }}
            >
              <div className="muted" style={{ fontWeight: 700 }}>
                {r.week}
              </div>
              <Bar value={r.newCount} max={weeklyMax} />
              <div style={{ textAlign: "right", fontWeight: 800 }}>{r.newCount}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Market “excel” */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div className="muted" style={{ fontWeight: 800 }}>
            Mercato per Zona
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              style={{ width: 260, padding: "10px 12px", borderRadius: 12 }}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <button onClick={exportZoneCSV} disabled={!zoneRows.length}>
              Export CSV (Zona)
            </button>
          </div>
        </div>

        {/* Totali */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 14 }}>
          <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
            <div className="muted" style={{ fontWeight: 800 }}>
              Controllo agenzia (OK)
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{pct(zoneTotals.ok, zoneTotals.total)}%</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {zoneTotals.ok} / {zoneTotals.total}
            </div>
          </div>
          <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
            <div className="muted" style={{ fontWeight: 800 }}>
              Potenziale (non assegnato)
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{pct(zoneTotals.pot, zoneTotals.total)}%</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {zoneTotals.pot} / {zoneTotals.total}
            </div>
          </div>
          <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
            <div className="muted" style={{ fontWeight: 800 }}>
              Da verificare (zona vuota)
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{pct(zoneTotals.ver, zoneTotals.total)}%</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {zoneTotals.ver} / {zoneTotals.total}
            </div>
          </div>
        </div>

        {/* BARRE COLORATE */}
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>
              OK (assegnato)
            </div>
            <div style={{ height: 14, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct(zoneTotals.ok, zoneTotals.total)}%`, background: "#16a34a" }} />
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>
              Potenziale (non assegnato)
            </div>
            <div style={{ height: 14, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct(zoneTotals.pot, zoneTotals.total)}%`, background: "#facc15" }} />
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>
              Da verificare (zona vuota)
            </div>
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
                <Th k="adv">Inserzionista</Th>
                <Th k="ok" alignRight>
                  OK
                </Th>
                <Th k="pot" alignRight>
                  Potenziale
                </Th>
                <Th k="ver" alignRight>
                  Da verificare
                </Th>
                <Th k="total" alignRight>
                  Totale
                </Th>
                <Th k="penPct" alignRight>
                  Pen %
                </Th>
                <Th k="okPct" alignRight>
                  OK %
                </Th>
                <Th k="potPct" alignRight>
                  Pot %
                </Th>
                <Th k="verPct" alignRight>
                  Ver %
                </Th>
              </tr>
            </thead>
            <tbody>
              {sortedZoneRows.map((r) => (
                <tr key={r.adv}>
                  <td style={{ fontWeight: 700 }}>{r.adv}</td>
                  <td style={{ textAlign: "right", fontWeight: 800 }}>{r.ok}</td>
                  <td style={{ textAlign: "right", fontWeight: 800 }}>{r.pot}</td>
                  <td style={{ textAlign: "right", fontWeight: 800 }}>{r.ver}</td>
                  <td style={{ textAlign: "right", fontWeight: 900 }}>{r.total}</td>
                  <td style={{ textAlign: "right" }}>{r.penPct}%</td>
                  <td style={{ textAlign: "right" }}>{r.okPct}%</td>
                  <td style={{ textAlign: "right" }}>{r.potPct}%</td>
                  <td style={{ textAlign: "right" }}>{r.verPct}%</td>
                </tr>
              ))}
              {!sortedZoneRows.length && (
                <tr>
                  <td colSpan={9} className="muted" style={{ padding: 14 }}>
                    Nessun dato per questa zona.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PIE + TOP10 */}
        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontWeight: 800, marginBottom: 10 }}>
            Potenza inserzionisti (quota sul totale zona)
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 360px) 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
                <PieChart slices={pieAndTop.slices} size={260} />
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gap: 6,
                  maxHeight: 260,
                  overflowY: "auto",
                  paddingRight: 6,
                }}
              >
                {pieAndTop.slices.slice(0, 14).map((s, i) => (
                  <div
                    key={`${s.label}-${i}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "12px 1fr 64px",
                      gap: 10,
                      alignItems: "center",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ width: 12, height: 12, borderRadius: 4, background: s.color }} />
                    <div
                      title={s.label}
                      style={{
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      className="muted"
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pct(s.value, zoneTotals.total)}%
                    </div>
                  </div>
                ))}
              </div>

              <div className="muted" style={{ marginTop: 10 }}>
                (pie: top 12 + “Altri”)
              </div>
            </div>

            <div className="card" style={{ background: "rgba(255,255,255,0.6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>Top 10 inserzionisti</div>
                <div className="muted">Zona: {zone || "—"}</div>
              </div>

              <div className="table-wrap" style={{ marginTop: 10, borderRadius: 12, overflow: "hidden" }}>
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Inserzionista</th>
                      <th style={{ textAlign: "right" }}>Totale</th>
                      <th style={{ textAlign: "right" }}>Pen %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pieAndTop.top10.map((r) => (
                      <tr key={r.adv}>
                        <td style={{ fontWeight: 800 }}>{r.adv}</td>
                        <td style={{ textAlign: "right", fontWeight: 900 }}>{r.total}</td>
                        <td style={{ textAlign: "right" }}>{r.penPct}%</td>
                      </tr>
                    ))}
                    {!pieAndTop.top10.length && (
                      <tr>
                        <td colSpan={3} className="muted" style={{ padding: 14 }}>
                          Nessun dato.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ===== NUOVI GRAFICI: PREZZI PER MESE (MEDIANA) ===== */}
        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontWeight: 800, marginBottom: 10 }}>
            Prezzi per mese (zona selezionata)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <VerticalBars
              title="Prezzo (mediana) per mese"
              subtitle={`Zona: ${zone || "—"}`}
              data={priceMonthly.filter((r) => Number.isFinite(r.medianPrice) && r.medianPrice > 0)}
              valueKey="medianPrice"
              yFormatter={(v) => fmtMoney(v)}
              height={280}
            />

            <VerticalBars
              title="€/m² (mediana) per mese"
              subtitle={`Zona: ${zone || "—"} (solo annunci con m²)`}
              data={priceMonthly
                .filter((r) => Number.isFinite(r.medianEurMq) && r.medianEurMq > 0)
                .map((r) => ({ ...r, medianEurMq: r.medianEurMq }))}
              valueKey="medianEurMq"
              yFormatter={(v) => fmtMoney(v)}
              height={280}
            />
          </div>

          <div className="muted" style={{ marginTop: 10, fontWeight: 600 }}>
            Nota: mese calcolato da <b>first_seen_at</b>. Tooltip passando il mouse sulle barre.
          </div>
        </div>

        <div className="muted" style={{ marginTop: 10, fontWeight: 600 }}>
          Definizioni: <b>OK</b>=assegnato, <b>Potenziale</b>=non assegnato, <b>Da verificare</b>=zona vuota,{" "}
          <b>Pen %</b>=quota inserzionista sul totale della zona.
        </div>
      </div>
    </div>
  );
}
