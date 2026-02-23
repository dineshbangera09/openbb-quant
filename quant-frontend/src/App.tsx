import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, ComposedChart,
} from "recharts";

const API = "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candle {
  date: string;
  open: number; high: number; low: number; close: number;
  volume: number;
  sma_20: number | null; sma_50: number | null; sma_200: number | null;
  bb_upper: number | null; bb_middle: number | null; bb_lower: number | null;
  bb_width: number | null;
  rsi: number | null;
  macd: number; macd_signal: number; macd_hist: number;
  stoch_k: number | null; stoch_d: number | null;
  atr: number; obv: number;
  signal: number;
}

interface Summary {
  symbol: string; price: number; change: number; change_pct: number;
  high_52w: number; low_52w: number; avg_volume: number;
  rsi: number | null; atr: number | null;
}

interface EquityPoint { date: string; equity: number; }
interface Trade { date: string; type: "BUY" | "SELL"; price: number; shares: number; }

interface Backtest {
  total_return: number; buy_hold_return: number; sharpe_ratio: number;
  max_drawdown: number; num_trades: number; win_rate: number;
  final_equity: number; equity_curve: EquityPoint[]; trades: Trade[];
}

interface StockData { summary: Summary; candles: Candle[]; backtest: Backtest; }

interface ScreenerRow {
  symbol: string; price: number; change_pct: number;
  rsi: number; above_200: boolean | null; bb_pos: number | null;
}

// ─── Color System (Light Theme) ───────────────────────────────────────────────
const C = {
  bg:      "#F0F4F8",
  surface: "#FFFFFF",
  card:    "#FFFFFF",
  border:  "#D1DCE8",
  accent:  "#0066CC",
  green:   "#059669",
  red:     "#DC2626",
  yellow:  "#D97706",
  purple:  "#7C3AED",
  text:    "#0F172A",
  muted:   "#64748B",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, d = 2): string =>
  n == null ? "—" : Number(n).toFixed(d);

const fmtK = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

const fmtDate = (d: string): string => (d ? d.slice(5) : "");

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps { label: string; value: string; sub?: string; color?: string; }
function StatCard({ label, value, sub, color = C.text }: StatCardProps) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── RSI Gauge ────────────────────────────────────────────────────────────────
function RSIGauge({ rsi }: { rsi: number | null }) {
  const v = rsi ?? 50;
  const pct = v / 100;
  const color = v > 70 ? C.red : v < 30 ? C.green : C.yellow;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={120} height={70} viewBox="0 0 120 70">
        <path d="M10,65 A50,50 0 0,1 110,65" fill="none" stroke={C.border} strokeWidth="10" strokeLinecap="round" />
        <path d="M10,65 A50,50 0 0,1 110,65" fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${pct * 157} 157`} />
        <text x="60" y="58" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">
          {fmt(v, 0)}
        </text>
      </svg>
      <div style={{ fontSize: 11, color, fontWeight: 600 }}>
        {v > 70 ? "OVERBOUGHT" : v < 30 ? "OVERSOLD" : "NEUTRAL"}
      </div>
    </div>
  );
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: number }) {
  if (!signal) return null;
  const cfg = signal === 1
    ? { label: "BUY", color: "#FFFFFF", bg: C.green }
    : { label: "SELL", color: "#FFFFFF", bg: C.red };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}`, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
      {cfg.label}
    </span>
  );
}

// ─── Candle Chart (SVG) ───────────────────────────────────────────────────────
function CandleChart({ data }: { data: Candle[] }) {
  if (!data || data.length === 0) return null;
  const w = 800, h = 220, pad = { l: 50, r: 10, t: 10, b: 20 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const n = data.length;

  const prices = data.flatMap(d => [d.low, d.high, d.bb_upper ?? d.high, d.bb_lower ?? d.low]);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const scaleY = (v: number) => ih - ((v - minP) / (maxP - minP)) * ih + pad.t;
  const scaleX = (i: number) => pad.l + (i / (n - 1)) * iw;
  const bw = Math.max(2, (iw / n) * 0.6);

  const bbPath = (key: keyof Candle): string =>
    data.map((d, i) => {
      const v = d[key] as number | null;
      return v != null ? `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(v)}` : "";
    }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {/* BB fill */}
      <path
        d={[
          ...data.map((d, i) => d.bb_upper != null ? `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(d.bb_upper)}` : ""),
          ...data.slice().reverse().map((d, i) => d.bb_lower != null ? `L${scaleX(n - 1 - i)},${scaleY(d.bb_lower)}` : ""),
        ].join(" ")}
        fill={C.accent} fillOpacity={0.05}
      />
      <path d={bbPath("bb_upper")} fill="none" stroke={C.accent} strokeWidth={0.5} strokeDasharray="3,3" />
      <path d={bbPath("bb_lower")} fill="none" stroke={C.accent} strokeWidth={0.5} strokeDasharray="3,3" />
      <path d={bbPath("bb_middle")} fill="none" stroke={C.muted} strokeWidth={0.5} />
      <path d={bbPath("sma_50")} fill="none" stroke={C.yellow} strokeWidth={1} />
      <path d={bbPath("sma_200")} fill="none" stroke={C.purple} strokeWidth={1} />

      {/* Candles */}
      {data.map((d, i) => {
        const x = scaleX(i);
        const col = d.close >= d.open ? C.green : C.red;
        const y1 = scaleY(Math.max(d.open, d.close));
        const y2 = scaleY(Math.min(d.open, d.close));
        return (
          <g key={i}>
            <line x1={x} y1={scaleY(d.high)} x2={x} y2={scaleY(d.low)} stroke={col} strokeWidth={0.5} />
            <rect x={x - bw / 2} y={y1} width={bw} height={Math.max(1, y2 - y1)} fill={col} opacity={0.85} />
            {d.signal === 1  && <polygon points={`${x},${scaleY(d.low) - 8} ${x - 4},${scaleY(d.low) - 2} ${x + 4},${scaleY(d.low) - 2}`} fill={C.green} />}
            {d.signal === -1 && <polygon points={`${x},${scaleY(d.high) + 8} ${x - 4},${scaleY(d.high) + 2} ${x + 4},${scaleY(d.high) + 2}`} fill={C.red} />}
          </g>
        );
      })}
      {/* Y axis */}
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const val = minP + p * (maxP - minP);
        const y = scaleY(val);
        return (
          <g key={p}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={C.border} strokeWidth={0.5} />
            <text x={pad.l - 4} y={y + 4} textAnchor="end" fill={C.muted} fontSize={9}>{fmt(val)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [symbol, setSymbol]       = useState("AAPL");
  const [input, setInput]         = useState("AAPL");
  const [tab, setTab]             = useState<"chart" | "indicators" | "backtest" | "stats">("chart");
  const [loading, setLoading]     = useState(false);
  const [stock, setStock]         = useState<StockData | null>(null);
  const [screener, setScreener]   = useState<ScreenerRow[]>([]);
  const [apiMode, setApiMode]     = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown]     = useState(60);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing]   = useState(false); // silent background refresh

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStock = useCallback(async (sym: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      if (apiMode) {
        const r = await fetch(`${API}/api/stock/${sym}`);
        if (!r.ok) throw new Error(await r.text());
        setStock(await r.json());
      } else {
        setStock(generateDemoStock(sym));
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error(e);
      if (!silent) setStock(generateDemoStock(sym));
    }
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [apiMode]);

  const fetchScreener = useCallback(async () => {
    try {
      if (apiMode) {
        const r = await fetch(`${API}/api/screener`);
        setScreener(await r.json());
      } else {
        setScreener(generateDemoScreener());
      }
    } catch {
      setScreener(generateDemoScreener());
    }
  }, [apiMode]);

  // ── Initial load
  useEffect(() => { fetchStock(symbol); }, [symbol, fetchStock]);
  useEffect(() => { fetchScreener(); },   [fetchScreener]);

  // ── Auto-refresh: 60s interval + countdown ticker
  useEffect(() => {
    // Clear any existing timers
    if (intervalRef.current)  clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (autoRefresh && apiMode) {
      setCountdown(60);

      // Countdown every second
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) return 60;
          return prev - 1;
        });
      }, 1000);

      // Refresh data every 60 seconds
      intervalRef.current = setInterval(() => {
        fetchStock(symbol, true); // silent = no full loading spinner
        fetchScreener();
        setCountdown(60);
      }, 60_000);
    } else {
      setCountdown(60);
    }

    return () => {
      if (intervalRef.current)  clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, apiMode, symbol, fetchStock, fetchScreener]);

  // ── Turn off auto-refresh when switching to demo mode
  useEffect(() => {
    if (!apiMode) setAutoRefresh(false);
  }, [apiMode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) setSymbol(input.trim().toUpperCase());
  };

  const s = stock?.summary;
  const candles = stock?.candles ?? [];
  const bt = stock?.backtest;
  const lastCandle = candles[candles.length - 1];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: 20, background: C.surface, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
        <div style={{ color: C.accent, fontWeight: 700, fontSize: 16, letterSpacing: 2 }}>◈ QUANTTERM</div>

        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="Symbol…"
            style={{ background: "#F8FAFC", border: `1px solid ${C.border}`, color: C.text, padding: "6px 12px", borderRadius: 4, width: 110, fontFamily: "inherit", fontSize: 13, outline: "none" }} />
          <button type="submit" style={{ background: C.accent, color: C.bg, border: "none", padding: "6px 14px", borderRadius: 4, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>GO</button>
        </form>

        {s && (
          <div style={{ display: "flex", gap: 24, marginLeft: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 18 }}>{s.symbol}</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: C.accent }}>${fmt(s.price)}</span>
            <span style={{ color: s.change >= 0 ? C.green : C.red, fontSize: 14, fontWeight: 600 }}>
              {s.change >= 0 ? "▲" : "▼"} {fmt(Math.abs(s.change))} ({fmt(Math.abs(s.change_pct))}%)
            </span>
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>

          {/* Last updated timestamp */}
          {lastUpdated && (
            <span style={{ fontSize: 10, color: C.muted }}>
              Updated {lastUpdated}
            </span>
          )}

          {/* Silent refresh pulse dot */}
          {refreshing && (
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: C.accent, animation: "pulse 0.8s ease-in-out infinite" }} />
          )}

          {/* Auto-refresh toggle — only shown in LIVE API mode */}
          {apiMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F1F5F9", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px" }}>
              {/* Toggle switch */}
              <div
                onClick={() => setAutoRefresh(v => !v)}
                style={{ cursor: "pointer", width: 32, height: 16, borderRadius: 8, background: autoRefresh ? C.green : C.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", top: 2, left: autoRefresh ? 16 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
              <span style={{ fontSize: 11, color: autoRefresh ? C.green : C.muted, fontWeight: 600 }}>
                AUTO
              </span>
              {/* Countdown ring */}
              {autoRefresh && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width={18} height={18} viewBox="0 0 18 18" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx={9} cy={9} r={7} fill="none" stroke={C.border} strokeWidth={2} />
                    <circle cx={9} cy={9} r={7} fill="none" stroke={C.green} strokeWidth={2}
                      strokeDasharray={`${2 * Math.PI * 7}`}
                      strokeDashoffset={`${2 * Math.PI * 7 * (1 - countdown / 60)}`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 0.9s linear" }}
                    />
                  </svg>
                  <span style={{ fontSize: 10, color: C.green, fontWeight: 700, minWidth: 18 }}>{countdown}s</span>
                </div>
              )}
            </div>
          )}

          {/* Manual refresh button */}
          <button
            onClick={() => { fetchStock(symbol, true); fetchScreener(); setCountdown(60); }}
            title="Refresh now"
            style={{ background: "#F1F5F9", border: `1px solid ${C.border}`, color: C.muted, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >↻</button>

          {/* Mode toggle */}
          <span style={{ fontSize: 11, color: C.muted }}>MODE:</span>
          <button onClick={() => setApiMode(v => !v)}
            style={{ background: apiMode ? "#DCFCE7" : "#F1F5F9", border: `1px solid ${apiMode ? C.green : C.border}`, color: apiMode ? C.green : C.muted, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}>
            {apiMode ? "LIVE API" : "DEMO"}
          </button>
        </div>

        {/* Pulse animation keyframes */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.4; transform: scale(1.4); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* ── Refresh progress bar ── */}
      <div style={{ height: 3, background: C.border, position: "relative" }}>
        {autoRefresh && apiMode && (
          <div style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            background: C.green,
            width: `${(countdown / 60) * 100}%`,
            transition: "width 0.9s linear",
          }} />
        )}
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 55px)" }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 200, borderRight: `1px solid ${C.border}`, background: C.surface, overflowY: "auto", padding: "12px 0" }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, padding: "0 14px 8px" }}>WATCHLIST</div>
          {screener.map(row => (
            <div key={row.symbol} onClick={() => { setSymbol(row.symbol); setInput(row.symbol); }}
              style={{ padding: "10px 14px", cursor: "pointer", background: symbol === row.symbol ? "#EEF4FF" : "transparent", borderLeft: symbol === row.symbol ? `2px solid ${C.accent}` : "2px solid transparent", display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{row.symbol}</span>
                <span style={{ color: row.change_pct >= 0 ? C.green : C.red, fontSize: 11 }}>{row.change_pct >= 0 ? "+" : ""}{fmt(row.change_pct)}%</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>${fmt(row.price)}</div>
              <div style={{ fontSize: 10, color: row.rsi > 70 ? C.red : row.rsi < 30 ? C.green : C.muted }}>RSI {fmt(row.rsi, 0)}</div>
            </div>
          ))}
        </div>

        {/* ── Main ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && (
            <div style={{ textAlign: "center", paddingTop: 80, color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>◈</div>Loading {symbol}…
            </div>
          )}

          {!loading && stock && s && (
            <>
              {/* Stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
                <StatCard label="52W High" value={`$${fmt(s.high_52w)}`} />
                <StatCard label="52W Low"  value={`$${fmt(s.low_52w)}`} />
                <StatCard label="Avg Vol"  value={fmtK(s.avg_volume)} />
                <StatCard label="ATR"      value={fmt(s.atr)} />
                <StatCard label="RSI"      value={fmt(s.rsi, 0)} color={s.rsi != null ? (s.rsi > 70 ? C.red : s.rsi < 30 ? C.green : C.yellow) : C.text} />
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {lastCandle?.signal !== 0 ? <SignalBadge signal={lastCandle?.signal ?? 0} /> : <span style={{ color: C.muted, fontSize: 11 }}>HOLD</span>}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                {(["chart", "indicators", "backtest", "stats"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    background: tab === t ? C.accent + "22" : "transparent", color: tab === t ? C.accent : C.muted,
                    border: `1px solid ${tab === t ? C.accent : "transparent"}`, padding: "5px 14px", borderRadius: 4,
                    cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                  }}>{t}</button>
                ))}
              </div>

              {/* ── CHART TAB ── */}
              {tab === "chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, display: "flex", gap: 16 }}>
                      <span style={{ color: C.yellow }}>— SMA50</span>
                      <span style={{ color: C.purple }}>— SMA200</span>
                      <span style={{ color: C.accent, opacity: 0.7 }}>·· BB</span>
                      <span style={{ color: C.green }}>▲ BUY</span>
                      <span style={{ color: C.red }}>▼ SELL</span>
                    </div>
                    <CandleChart data={candles} />
                  </div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, height: 100 }}>
                    <ResponsiveContainer>
                      <BarChart data={candles} margin={{ top: 0, bottom: 0, left: 40, right: 10 }}>
                        <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={40} tickFormatter={fmtK} />
                        <Bar dataKey="volume" fill={C.accent} opacity={0.4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ── INDICATORS TAB ── */}
              {tab === "indicators" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>RSI (14)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <RSIGauge rsi={lastCandle?.rsi ?? null} />
                      <div style={{ flex: 1, height: 120 }}>
                        <ResponsiveContainer>
                          <LineChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 30 }}>
                            <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 9 }} width={30} />
                            <ReferenceLine y={70} stroke={C.red} strokeDasharray="3 3" />
                            <ReferenceLine y={30} stroke={C.green} strokeDasharray="3 3" />
                            <Line type="monotone" dataKey="rsi" stroke={C.yellow} dot={false} strokeWidth={1.5} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>MACD (12/26/9)</div>
                    <div style={{ height: 130 }}>
                      <ResponsiveContainer>
                        <ComposedChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 30 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={30} />
                          <ReferenceLine y={0} stroke={C.border} />
                          <Bar dataKey="macd_hist" fill={C.accent} opacity={0.5} />
                          <Line type="monotone" dataKey="macd" stroke={C.accent} dot={false} strokeWidth={1.5} />
                          <Line type="monotone" dataKey="macd_signal" stroke={C.red} dot={false} strokeWidth={1} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>STOCHASTIC (14,3)</div>
                    <div style={{ height: 130 }}>
                      <ResponsiveContainer>
                        <LineChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 30 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 9 }} width={30} />
                          <ReferenceLine y={80} stroke={C.red} strokeDasharray="3 3" />
                          <ReferenceLine y={20} stroke={C.green} strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="stoch_k" stroke={C.accent} dot={false} strokeWidth={1.5} />
                          <Line type="monotone" dataKey="stoch_d" stroke={C.yellow} dot={false} strokeWidth={1} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>BB WIDTH (Squeeze)</div>
                    <div style={{ height: 130 }}>
                      <ResponsiveContainer>
                        <AreaChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 30 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={30} />
                          <defs>
                            <linearGradient id="bbg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={C.purple} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={C.purple} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="bb_width" stroke={C.purple} fill="url(#bbg)" dot={false} strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* ── BACKTEST TAB ── */}
              {tab === "backtest" && bt && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                    <StatCard label="Total Return"  value={`${fmt(bt.total_return)}%`}     color={bt.total_return >= 0 ? C.green : C.red} />
                    <StatCard label="Buy & Hold"    value={`${fmt(bt.buy_hold_return)}%`}  color={bt.buy_hold_return >= 0 ? C.green : C.red} />
                    <StatCard label="Sharpe Ratio"  value={fmt(bt.sharpe_ratio, 3)}         color={bt.sharpe_ratio > 1 ? C.green : C.yellow} />
                    <StatCard label="Max Drawdown"  value={`${fmt(bt.max_drawdown)}%`}     color={C.red} />
                    <StatCard label="Win Rate"      value={`${fmt(bt.win_rate)}%`}          sub={`${bt.num_trades} trades`} />
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>EQUITY CURVE</div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer>
                        <AreaChart data={bt.equity_curve} margin={{ top: 5, right: 10, bottom: 5, left: 60 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={60} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                          <defs>
                            <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={C.green} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 11 }}
                            formatter={(v: number) => [`$${v.toLocaleString()}`, "Equity"]} />
                          <Area type="monotone" dataKey="equity" stroke={C.green} fill="url(#eqg)" dot={false} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, letterSpacing: 1 }}>RECENT TRADES</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: C.muted, fontSize: 10 }}>
                          {["Date", "Type", "Price", "Shares", "Value"].map(h => (
                            <th key={h} style={{ padding: "4px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bt.trades.map((t, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
                            <td style={{ padding: "6px 8px", color: C.muted }}>{t.date}</td>
                            <td style={{ padding: "6px 8px" }}><SignalBadge signal={t.type === "BUY" ? 1 : -1} /></td>
                            <td style={{ padding: "6px 8px" }}>${fmt(t.price)}</td>
                            <td style={{ padding: "6px 8px" }}>{t.shares.toLocaleString()}</td>
                            <td style={{ padding: "6px 8px", color: C.accent }}>${(t.price * t.shares).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── STATS TAB ── */}
              {tab === "stats" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, letterSpacing: 1 }}>PRICE vs MOVING AVERAGES</div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer>
                        <LineChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 40 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={40} />
                          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 11 }} />
                          <Line type="monotone" dataKey="close"   stroke={C.text}   dot={false} strokeWidth={1.5} name="Price" />
                          <Line type="monotone" dataKey="sma_20"  stroke={C.accent} dot={false} strokeWidth={1}   name="SMA20" />
                          <Line type="monotone" dataKey="sma_50"  stroke={C.yellow} dot={false} strokeWidth={1}   name="SMA50" />
                          <Line type="monotone" dataKey="sma_200" stroke={C.purple} dot={false} strokeWidth={1}   name="SMA200" />
                          <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, letterSpacing: 1 }}>OBV (On-Balance Volume)</div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer>
                        <AreaChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 50 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={50} tickFormatter={fmtK} />
                          <defs>
                            <linearGradient id="obvg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={C.yellow} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={C.yellow} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="obv" stroke={C.yellow} fill="url(#obvg)" dot={false} strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, letterSpacing: 1 }}>ATR (Average True Range)</div>
                    <div style={{ height: 150 }}>
                      <ResponsiveContainer>
                        <LineChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 40 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={40} />
                          <Line type="monotone" dataKey="atr" stroke={C.red} dot={false} strokeWidth={1.5} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, letterSpacing: 1 }}>SCREENER COMPARISON</div>
                    <div style={{ height: 150 }}>
                      <ResponsiveContainer>
                        <BarChart data={screener} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                          <XAxis dataKey="symbol" tick={{ fill: C.muted, fontSize: 9 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} />
                          <ReferenceLine y={0} stroke={C.border} />
                          <Bar dataKey="change_pct" radius={[2, 2, 0, 0]}
                            fill={C.accent}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Demo Data Generators ─────────────────────────────────────────────────────
function makeSeed(sym: string) {
  const seed = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function generateDemoStock(symbol: string): StockData {
  const rng = makeSeed(symbol);
  const n = 100;
  const basePrice = 100 + rng() * 300;
  let price = basePrice;

  const dates = Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - i));
    return d.toISOString().slice(0, 10);
  });

  const raw = dates.map(date => {
    price *= (1 + (rng() - 0.48) * 0.025);
    return { date, close: price, open: price * (1 + (rng() - 0.5) * 0.01), high: price * (1 + rng() * 0.01), low: price * (1 - rng() * 0.01), volume: Math.floor(5e6 + rng() * 25e6) };
  });

  const smaFn = (arr: number[], w: number) => arr.map((_, i) => i < w - 1 ? null : arr.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w);
  const closes = raw.map(d => d.close);
  const sma20 = smaFn(closes, 20), sma50 = smaFn(closes, 50), sma200 = smaFn(closes, 200);
  const std20 = closes.map((_, i) => {
    if (i < 19) return null;
    const sl = closes.slice(i - 19, i + 1);
    const m = sl.reduce((a, b) => a + b) / 20;
    return Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
  });

  const rsiArr = closes.map((_, i) => {
    if (i < 14) return null;
    const changes = closes.slice(i - 13, i + 1).map((v, j, a) => j === 0 ? 0 : v - a[j - 1]);
    const gain = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
    const loss = -changes.filter(c => c < 0).reduce((a, b) => a + b, 0) / 14;
    return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  });

  const ema12: number[] = closes.map((v, i) => i === 0 ? v : 0);
  const ema26: number[] = closes.map((v, i) => i === 0 ? v : 0);
  for (let i = 1; i < n; i++) {
    ema12[i] = closes[i] * (2 / 13) + ema12[i - 1] * (1 - 2 / 13);
    ema26[i] = closes[i] * (2 / 27) + ema26[i - 1] * (1 - 2 / 27);
  }
  const macdArr = ema12.map((v, i) => v - ema26[i]);
  const macdSig: number[] = [...macdArr];
  for (let i = 1; i < n; i++) macdSig[i] = macdArr[i] * (2 / 10) + macdSig[i - 1] * (1 - 2 / 10);

  const low14  = raw.map((_, i) => i < 13 ? null : Math.min(...raw.slice(i - 13, i + 1).map(d => d.low)));
  const high14 = raw.map((_, i) => i < 13 ? null : Math.max(...raw.slice(i - 13, i + 1).map(d => d.high)));
  const stochK = raw.map((d, i) => (high14[i] != null && low14[i] != null) ? 100 * (d.close - low14[i]!) / (high14[i]! - low14[i]!) : null);

  const candles: Candle[] = raw.map((d, i) => {
    const prev20  = sma20[i - 1];
    const prev50  = sma50[i - 1];
    const signal  = (sma20[i] != null && prev20 != null && sma50[i] != null && prev50 != null)
      ? sma20[i]! > sma50[i]! && prev20 <= prev50 ? 1
      : sma20[i]! < sma50[i]! && prev20 >= prev50 ? -1 : 0
      : 0;

    return {
      date: d.date,
      open:  Math.round(d.open  * 100) / 100,
      close: Math.round(d.close * 100) / 100,
      high:  Math.round(d.high  * 100) / 100,
      low:   Math.round(d.low   * 100) / 100,
      volume: d.volume,
      sma_20:  sma20[i]  != null ? Math.round(sma20[i]!  * 100) / 100 : null,
      sma_50:  sma50[i]  != null ? Math.round(sma50[i]!  * 100) / 100 : null,
      sma_200: sma200[i] != null ? Math.round(sma200[i]! * 100) / 100 : null,
      bb_upper:  (sma20[i] != null && std20[i] != null) ? Math.round((sma20[i]! + 2 * std20[i]!) * 100) / 100 : null,
      bb_middle: sma20[i] != null ? Math.round(sma20[i]! * 100) / 100 : null,
      bb_lower:  (sma20[i] != null && std20[i] != null) ? Math.round((sma20[i]! - 2 * std20[i]!) * 100) / 100 : null,
      bb_width:  (sma20[i] != null && std20[i] != null) ? Math.round((4 * std20[i]! / sma20[i]!) * 1000) / 1000 : null,
      rsi:        rsiArr[i] != null ? Math.round(rsiArr[i]! * 10) / 10 : null,
      macd:       Math.round(macdArr[i] * 1000) / 1000,
      macd_signal: Math.round(macdSig[i] * 1000) / 1000,
      macd_hist:  Math.round((macdArr[i] - macdSig[i]) * 1000) / 1000,
      stoch_k: stochK[i] != null ? Math.round(stochK[i]! * 10) / 10 : null,
      stoch_d: stochK[i] != null ? Math.round(stochK[i]! * 10) / 10 : null,
      atr:  Math.round(Math.abs(d.high - d.low) * 100) / 100,
      obv:  i * 1000000 * (rng() > 0.4 ? 1 : -0.5),
      signal,
    };
  });

  const lastC = candles[n - 1], prevC = candles[n - 2];
  const change = lastC.close - prevC.close;

  // Backtest
  const equity_curve: EquityPoint[] = [];
  let cash = 100000, pos = 0;
  const trades: Trade[] = [];
  candles.forEach(d => {
    if (d.signal === 1 && pos === 0) {
      const shares = Math.floor(cash * 0.95 / d.close);
      if (shares > 0) { pos = shares; cash -= shares * d.close; trades.push({ date: d.date, type: "BUY", price: d.close, shares }); }
    } else if (d.signal === -1 && pos > 0) {
      cash += pos * d.close;
      trades.push({ date: d.date, type: "SELL", price: d.close, shares: pos });
      pos = 0;
    }
    equity_curve.push({ date: d.date, equity: Math.round(cash + pos * d.close) });
  });
  const finalEq = cash + pos * lastC.close;
  const eqVals = equity_curve.map(e => e.equity);
  const dailyRets = eqVals.slice(1).map((v, i) => (v - eqVals[i]) / eqVals[i]);
  const mean = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
  const stdDev = Math.sqrt(dailyRets.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyRets.length);
  const sharpe = Math.round((mean / stdDev) * Math.sqrt(252) * 1000) / 1000;
  const rollMax = eqVals.reduce<number[]>((acc, v) => { acc.push(Math.max(acc[acc.length - 1] ?? v, v)); return acc; }, []);
  const maxDD = Math.round(Math.min(...eqVals.map((v, i) => (v - rollMax[i]) / rollMax[i])) * 10000) / 100;
  const sellTrades = trades.filter(t => t.type === "SELL");
  const buyList = trades.filter(t => t.type === "BUY");
  const wins = sellTrades.filter((_, i) => buyList[i] && sellTrades[i].price > buyList[i].price);

  return {
    summary: {
      symbol, price: lastC.close, change: Math.round(change * 100) / 100,
      change_pct: Math.round(change / prevC.close * 10000) / 100,
      high_52w: Math.round(Math.max(...candles.map(d => d.high)) * 100) / 100,
      low_52w:  Math.round(Math.min(...candles.map(d => d.low))  * 100) / 100,
      avg_volume: Math.floor(raw.slice(-20).reduce((a, b) => a + b.volume, 0) / 20),
      rsi: lastC.rsi, atr: lastC.atr,
    },
    candles,
    backtest: {
      total_return:     Math.round((finalEq - 100000) / 100000 * 10000) / 100,
      buy_hold_return:  Math.round((lastC.close - candles[0].close) / candles[0].close * 10000) / 100,
      sharpe_ratio: sharpe, max_drawdown: maxDD,
      num_trades: sellTrades.length,
      win_rate: sellTrades.length ? Math.round(wins.length / sellTrades.length * 1000) / 10 : 0,
      final_equity: Math.round(finalEq), equity_curve, trades: trades.slice(-20),
    },
  };
}

function generateDemoScreener(): ScreenerRow[] {
  return ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX"].map(sym => {
    const rng = makeSeed(sym + "scr");
    return {
      symbol: sym,
      price:      Math.round((100 + rng() * 400) * 100) / 100,
      change_pct: Math.round((rng() * 6 - 2.5) * 100) / 100,
      rsi:        Math.round(30 + rng() * 50),
      above_200:  rng() > 0.4,
      bb_pos:     Math.round(rng() * 100),
    };
  });
}