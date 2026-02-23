import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, ComposedChart, Scatter
} from "recharts";

const API = "http://localhost:8000";

// ─── Color System ────────────────────────────────────────────────────────────
const C = {
  bg:       "#080C10",
  surface:  "#0D1117",
  card:     "#111820",
  border:   "#1C2830",
  accent:   "#00D4FF",
  green:    "#00FF88",
  red:      "#FF3860",
  yellow:   "#FFD700",
  purple:   "#9B59FF",
  text:     "#E8F0FE",
  muted:    "#5A7080",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => n == null ? "—" : Number(n).toFixed(d);
const fmtK = n => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : n;
const fmtDate = d => d ? d.slice(5) : "";

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Spark({ data, color }) {
  const vals = data.map(d => d.close ?? d.equity ?? 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = 80, h = 32;
  const pts = vals.map((v, i) => [
    (i / (vals.length - 1)) * w,
    h - ((v - min) / (max - min || 1)) * h
  ]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  return (
    <svg width={w} height={h}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = C.text }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── RSI Gauge ────────────────────────────────────────────────────────────────
function RSIGauge({ rsi }) {
  const v = rsi ?? 50;
  const pct = v / 100;
  const color = v > 70 ? C.red : v < 30 ? C.green : C.yellow;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={120} height={70} viewBox="0 0 120 70">
        <path d="M10,65 A50,50 0 0,1 110,65" fill="none" stroke={C.border} strokeWidth="10" strokeLinecap="round" />
        <path
          d={`M10,65 A50,50 0 0,1 110,65`}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${pct * 157} 157`}
        />
        <text x="60" y="58" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">{fmt(v, 0)}</text>
      </svg>
      <div style={{ fontSize: 11, color: v > 70 ? C.red : v < 30 ? C.green : C.yellow, fontWeight: 600 }}>
        {v > 70 ? "OVERBOUGHT" : v < 30 ? "OVERSOLD" : "NEUTRAL"}
      </div>
    </div>
  );
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  if (!signal) return null;
  const cfg = signal === 1
    ? { label: "BUY", color: C.green, bg: "#002211" }
    : { label: "SELL", color: C.red,   bg: "#220011" };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}`, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
      {cfg.label}
    </span>
  );
}

// ─── Candle Chart (SVG) ───────────────────────────────────────────────────────
function CandleChart({ data }) {
  if (!data || data.length === 0) return null;
  const w = 800, h = 220, pad = { l: 50, r: 10, t: 10, b: 20 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const n = data.length;
  const prices = data.flatMap(d => [d.low, d.high, d.bb_upper ?? d.high, d.bb_lower ?? d.low].filter(Boolean));
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const scaleY = v => ih - ((v - minP) / (maxP - minP)) * ih + pad.t;
  const scaleX = i => pad.l + (i / (n - 1)) * iw;
  const bw = Math.max(2, (iw / n) * 0.6);

  const bbPath = (key) =>
    data.map((d, i) => d[key] ? `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(d[key])}` : "").join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {/* BB fill */}
      <path
        d={[
          ...data.map((d, i) => d.bb_upper ? `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(d.bb_upper)}` : ""),
          ...data.slice().reverse().map((d, i) => d.bb_lower ? `${i === 0 ? "L" : "L"}${scaleX(n-1-i)},${scaleY(d.bb_lower)}` : "")
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
        const isUp = d.close >= d.open;
        const col = isUp ? C.green : C.red;
        const y1 = scaleY(Math.max(d.open, d.close));
        const y2 = scaleY(Math.min(d.open, d.close));
        return (
          <g key={i}>
            <line x1={x} y1={scaleY(d.high)} x2={x} y2={scaleY(d.low)} stroke={col} strokeWidth={0.5} />
            <rect x={x - bw/2} y={y1} width={bw} height={Math.max(1, y2 - y1)} fill={col} opacity={0.85} />
            {d.signal === 1  && <polygon points={`${x},${scaleY(d.low)-8} ${x-4},${scaleY(d.low)-2} ${x+4},${scaleY(d.low)-2}`} fill={C.green} />}
            {d.signal === -1 && <polygon points={`${x},${scaleY(d.high)+8} ${x-4},${scaleY(d.high)+2} ${x+4},${scaleY(d.high)+2}`} fill={C.red} />}
          </g>
        );
      })}
      {/* Y axis labels */}
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [symbol, setSymbol]       = useState("AAPL");
  const [input, setInput]         = useState("AAPL");
  const [tab, setTab]             = useState("chart");
  const [loading, setLoading]     = useState(false);
  const [stock, setStock]         = useState(null);
  const [screener, setScreener]   = useState([]);
  const [apiMode, setApiMode]     = useState(false); // true = live API, false = demo

  const fetchStock = useCallback(async (sym) => {
    setLoading(true);
    try {
      if (apiMode) {
        const r = await fetch(`${API}/api/stock/${sym}`);
        if (!r.ok) throw new Error(await r.text());
        setStock(await r.json());
      } else {
        // Demo mode — generate client-side
        setStock(generateDemoStock(sym));
      }
    } catch (e) {
      console.error(e);
      setStock(generateDemoStock(sym));
    }
    setLoading(false);
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

  useEffect(() => { fetchStock(symbol); }, [symbol, fetchStock]);
  useEffect(() => { fetchScreener(); }, [fetchScreener]);

  const handleSearch = (e) => {
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

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: 20, background: C.surface }}>
        <div style={{ color: C.accent, fontWeight: 700, fontSize: 16, letterSpacing: 2 }}>◈ QUANTTERM</div>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="Symbol…"
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "6px 12px", borderRadius: 4, width: 110, fontFamily: "inherit", fontSize: 13, outline: "none" }}
          />
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

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.muted }}>MODE:</span>
          <button
            onClick={() => setApiMode(v => !v)}
            style={{ background: apiMode ? C.green+"22" : C.card, border: `1px solid ${apiMode ? C.green : C.border}`, color: apiMode ? C.green : C.muted, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
          >
            {apiMode ? "LIVE API" : "DEMO"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        {/* Sidebar screener */}
        <div style={{ width: 200, borderRight: `1px solid ${C.border}`, background: C.surface, overflowY: "auto", padding: "12px 0" }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, padding: "0 14px 8px" }}>WATCHLIST</div>
          {screener.map(row => (
            <div
              key={row.symbol}
              onClick={() => { setSymbol(row.symbol); setInput(row.symbol); }}
              style={{
                padding: "10px 14px", cursor: "pointer",
                background: symbol === row.symbol ? C.card : "transparent",
                borderLeft: symbol === row.symbol ? `2px solid ${C.accent}` : "2px solid transparent",
                display: "flex", flexDirection: "column", gap: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{row.symbol}</span>
                <span style={{ color: row.change_pct >= 0 ? C.green : C.red, fontSize: 11 }}>{row.change_pct >= 0 ? "+" : ""}{fmt(row.change_pct)}%</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>${fmt(row.price)}</div>
              <div style={{ fontSize: 10, color: row.rsi > 70 ? C.red : row.rsi < 30 ? C.green : C.muted }}>RSI {fmt(row.rsi, 0)}</div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && (
            <div style={{ textAlign: "center", paddingTop: 80, color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>◈</div>
              Loading {symbol}…
            </div>
          )}

          {!loading && stock && (
            <>
              {/* Stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
                <StatCard label="52W High" value={`$${fmt(s.high_52w)}`} />
                <StatCard label="52W Low"  value={`$${fmt(s.low_52w)}`} />
                <StatCard label="Avg Vol"  value={fmtK(s.avg_volume)} />
                <StatCard label="ATR"      value={fmt(s.atr)} />
                <StatCard label="RSI"      value={fmt(s.rsi, 0)} color={s.rsi > 70 ? C.red : s.rsi < 30 ? C.green : C.yellow} />
                {lastCandle && <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {lastCandle.signal !== 0 ? <SignalBadge signal={lastCandle.signal} /> : <span style={{ color: C.muted, fontSize: 11 }}>HOLD</span>}
                </div>}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                {["chart", "indicators", "backtest", "stats"].map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    background: tab === t ? C.accent+"22" : "transparent",
                    color: tab === t ? C.accent : C.muted,
                    border: `1px solid ${tab === t ? C.accent : "transparent"}`,
                    padding: "5px 14px", borderRadius: 4, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase"
                  }}>{t}</button>
                ))}
              </div>

              {/* Chart tab */}
              {tab === "chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, display: "flex", gap: 16 }}>
                      <span style={{ color: C.yellow }}>— SMA50</span>
                      <span style={{ color: C.purple }}>— SMA200</span>
                      <span style={{ color: C.accent, opacity: 0.7 }}>·· BB</span>
                      <span style={{ color: C.green }}>▲ BUY</span>
                      <span style={{ color: C.red   }}>▼ SELL</span>
                    </div>
                    <CandleChart data={candles} />
                  </div>

                  {/* Volume */}
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

              {/* Indicators tab */}
              {tab === "indicators" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {/* RSI */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>RSI (14)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <RSIGauge rsi={lastCandle?.rsi} />
                      <div style={{ flex: 1, height: 120 }}>
                        <ResponsiveContainer>
                          <LineChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 30 }}>
                            <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 9 }} width={30} />
                            <ReferenceLine y={70} stroke={C.red}   strokeDasharray="3 3" />
                            <ReferenceLine y={30} stroke={C.green} strokeDasharray="3 3" />
                            <Line type="monotone" dataKey="rsi" stroke={C.yellow} dot={false} strokeWidth={1.5} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* MACD */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>MACD (12/26/9)</div>
                    <div style={{ height: 130 }}>
                      <ResponsiveContainer>
                        <ComposedChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 30 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={30} />
                          <ReferenceLine y={0} stroke={C.border} />
                          <Bar dataKey="macd_hist" fill={C.accent} opacity={0.5} />
                          <Line type="monotone" dataKey="macd"        stroke={C.accent} dot={false} strokeWidth={1.5} />
                          <Line type="monotone" dataKey="macd_signal" stroke={C.red}    dot={false} strokeWidth={1} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Stochastic */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>STOCHASTIC (14,3)</div>
                    <div style={{ height: 130 }}>
                      <ResponsiveContainer>
                        <LineChart data={candles} margin={{ top: 5, right: 10, bottom: 5, left: 30 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 9 }} width={30} />
                          <ReferenceLine y={80} stroke={C.red}   strokeDasharray="3 3" />
                          <ReferenceLine y={20} stroke={C.green} strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="stoch_k" stroke={C.accent} dot={false} strokeWidth={1.5} />
                          <Line type="monotone" dataKey="stoch_d" stroke={C.yellow} dot={false} strokeWidth={1} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* BB Width */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
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

              {/* Backtest tab */}
              {tab === "backtest" && bt && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                    <StatCard label="Total Return" value={`${fmt(bt.total_return)}%`} color={bt.total_return >= 0 ? C.green : C.red} />
                    <StatCard label="Buy & Hold"   value={`${fmt(bt.buy_hold_return)}%`} color={bt.buy_hold_return >= 0 ? C.green : C.red} />
                    <StatCard label="Sharpe Ratio" value={fmt(bt.sharpe_ratio, 3)} color={bt.sharpe_ratio > 1 ? C.green : C.yellow} />
                    <StatCard label="Max Drawdown" value={`${fmt(bt.max_drawdown)}%`} color={C.red} />
                    <StatCard label="Win Rate"     value={`${fmt(bt.win_rate)}%`} sub={`${bt.num_trades} trades`} />
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>EQUITY CURVE</div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer>
                        <AreaChart data={bt.equity_curve} margin={{ top: 5, right: 10, bottom: 5, left: 60 }}>
                          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: C.muted, fontSize: 8 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} width={60} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                          <defs>
                            <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={C.green} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Tooltip
                            contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 11 }}
                            formatter={v => [`$${v.toLocaleString()}`, "Equity"]}
                          />
                          <Area type="monotone" dataKey="equity" stroke={C.green} fill="url(#eqg)" dot={false} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
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

              {/* Stats tab */}
              {tab === "stats" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
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

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
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

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
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

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, letterSpacing: 1 }}>SCREENER COMPARISON</div>
                    <div style={{ height: 150 }}>
                      <ResponsiveContainer>
                        <BarChart data={screener} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                          <XAxis dataKey="symbol" tick={{ fill: C.muted, fontSize: 9 }} />
                          <YAxis tick={{ fill: C.muted, fontSize: 9 }} />
                          <ReferenceLine y={0} stroke={C.border} />
                          <Bar dataKey="change_pct" fill={C.accent} radius={[2, 2, 0, 0]}
                            label={false}
                            cells={screener.map((r, i) => (
                              <rect key={i} fill={r.change_pct >= 0 ? C.green : C.red} />
                            ))}
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
function generateDemoStock(symbol) {
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (() => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

  const n = 100;
  const basePrice = 100 + rng() * 300;
  let price = basePrice;
  const dates = Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - i));
    return d.toISOString().slice(0, 10);
  });

  const raw = dates.map(date => {
    const ret = (rng() - 0.48) * 0.025;
    price *= (1 + ret);
    return { date, close: price, open: price * (1 + (rng() - 0.5) * 0.01), high: price * (1 + rng() * 0.01), low: price * (1 - rng() * 0.01), volume: Math.floor(5e6 + rng() * 25e6) };
  });

  // Compute indicators
  const sma = (arr, w) => arr.map((_, i) => i < w - 1 ? null : arr.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w);
  const closes = raw.map(d => d.close);
  const sma20 = sma(closes, 20), sma50 = sma(closes, 50), sma200 = sma(closes, 200);
  const std20 = closes.map((_, i) => {
    if (i < 19) return null;
    const sl = closes.slice(i - 19, i + 1);
    const m = sl.reduce((a, b) => a + b) / 20;
    return Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
  });

  // RSI
  const rsi = closes.map((_, i) => {
    if (i < 14) return null;
    const changes = closes.slice(i - 13, i + 1).map((v, j, a) => j === 0 ? 0 : v - a[j - 1]);
    const gain = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
    const loss = -changes.filter(c => c < 0).reduce((a, b) => a + b, 0) / 14;
    return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  });

  const ema12 = closes.map((v, i) => i === 0 ? v : null);
  const ema26 = closes.map((v, i) => i === 0 ? v : null);
  for (let i = 1; i < n; i++) {
    ema12[i] = closes[i] * (2 / 13) + ema12[i - 1] * (1 - 2 / 13);
    ema26[i] = closes[i] * (2 / 27) + ema26[i - 1] * (1 - 2 / 27);
  }
  const macd = ema12.map((v, i) => v - ema26[i]);
  const macdSig = macd.map((v, i) => i === 0 ? v : null);
  for (let i = 1; i < n; i++) macdSig[i] = macd[i] * (2 / 10) + macdSig[i - 1] * (1 - 2 / 10);

  const low14 = raw.map((_, i) => i < 13 ? null : Math.min(...raw.slice(i - 13, i + 1).map(d => d.low)));
  const high14 = raw.map((_, i) => i < 13 ? null : Math.max(...raw.slice(i - 13, i + 1).map(d => d.high)));
  const stochK = raw.map((d, i) => high14[i] && low14[i] ? 100 * (d.close - low14[i]) / (high14[i] - low14[i]) : null);

  const candles = raw.map((d, i) => {
    const signal = (sma20[i] && sma20[i - 1] && sma50[i] && sma50[i - 1])
      ? sma20[i] > sma50[i] && sma20[i - 1] <= sma50[i - 1] ? 1
      : sma20[i] < sma50[i] && sma20[i - 1] >= sma50[i - 1] ? -1 : 0
      : 0;
    return {
      ...d,
      open: Math.round(d.open * 100) / 100,
      close: Math.round(d.close * 100) / 100,
      high: Math.round(d.high * 100) / 100,
      low: Math.round(d.low * 100) / 100,
      sma_20: sma20[i] ? Math.round(sma20[i] * 100) / 100 : null,
      sma_50: sma50[i] ? Math.round(sma50[i] * 100) / 100 : null,
      sma_200: sma200[i] ? Math.round(sma200[i] * 100) / 100 : null,
      bb_upper: sma20[i] && std20[i] ? Math.round((sma20[i] + 2 * std20[i]) * 100) / 100 : null,
      bb_middle: sma20[i] ? Math.round(sma20[i] * 100) / 100 : null,
      bb_lower: sma20[i] && std20[i] ? Math.round((sma20[i] - 2 * std20[i]) * 100) / 100 : null,
      rsi: rsi[i] ? Math.round(rsi[i] * 10) / 10 : null,
      macd: Math.round(macd[i] * 1000) / 1000,
      macd_signal: Math.round(macdSig[i] * 1000) / 1000,
      macd_hist: Math.round((macd[i] - macdSig[i]) * 1000) / 1000,
      stoch_k: stochK[i] ? Math.round(stochK[i] * 10) / 10 : null,
      stoch_d: stochK[i] ? Math.round(stochK[i] * 10) / 10 : null,
      atr: Math.round(Math.abs(d.high - d.low) * 100) / 100,
      obv: i * 1000000 * (rng() > 0.4 ? 1 : -0.5),
      bb_width: sma20[i] && std20[i] ? Math.round((4 * std20[i] / sma20[i]) * 1000) / 1000 : null,
      signal,
    };
  });

  const change = candles[n - 1].close - candles[n - 2].close;
  const summary = {
    symbol,
    price: candles[n - 1].close,
    change: Math.round(change * 100) / 100,
    change_pct: Math.round(change / candles[n - 2].close * 10000) / 100,
    high_52w: Math.round(Math.max(...candles.map(d => d.high)) * 100) / 100,
    low_52w: Math.round(Math.min(...candles.map(d => d.low)) * 100) / 100,
    avg_volume: Math.floor(raw.slice(-20).reduce((a, b) => a + b.volume, 0) / 20),
    rsi: candles[n - 1].rsi,
    atr: candles[n - 1].atr,
  };

  // Backtest
  const equity_curve = [];
  let cash = 100000, position = 0;
  const trades = [];
  candles.forEach(d => {
    if (d.signal === 1 && position === 0) {
      const shares = Math.floor(cash * 0.95 / d.close);
      if (shares > 0) { position = shares; cash -= shares * d.close; trades.push({ date: d.date, type: "BUY", price: d.close, shares }); }
    } else if (d.signal === -1 && position > 0) {
      cash += position * d.close;
      trades.push({ date: d.date, type: "SELL", price: d.close, shares: position });
      position = 0;
    }
    equity_curve.push({ date: d.date, equity: Math.round(cash + position * d.close) });
  });
  const finalEq = cash + position * candles[n - 1].close;
  const eqVals = equity_curve.map(e => e.equity);
  const dailyRets = eqVals.slice(1).map((v, i) => (v - eqVals[i]) / eqVals[i]);
  const mean = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
  const std = Math.sqrt(dailyRets.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyRets.length);
  const sharpe = Math.round((mean / std) * Math.sqrt(252) * 1000) / 1000;
  const rollMax = eqVals.reduce((acc, v) => { acc.push(Math.max(acc[acc.length - 1] ?? v, v)); return acc; }, []);
  const maxDD = Math.round(Math.min(...eqVals.map((v, i) => (v - rollMax[i]) / rollMax[i])) * 10000) / 100;
  const sellTrades = trades.filter(t => t.type === "SELL");
  const buyPrices = {};
  trades.filter(t => t.type === "BUY").forEach(t => { buyPrices[t.date] = t.price; });
  const wins = sellTrades.filter((t, i) => { const buyT = trades.filter(x => x.type === "BUY")[i]; return buyT && t.price > buyT.price; });

  return {
    summary,
    candles,
    backtest: {
      total_return: Math.round((finalEq - 100000) / 100000 * 10000) / 100,
      buy_hold_return: Math.round((candles[n - 1].close - candles[0].close) / candles[0].close * 10000) / 100,
      sharpe_ratio: sharpe,
      max_drawdown: maxDD,
      num_trades: sellTrades.length,
      win_rate: sellTrades.length ? Math.round(wins.length / sellTrades.length * 1000) / 10 : 0,
      final_equity: Math.round(finalEq),
      equity_curve,
      trades: trades.slice(-20),
    }
  };
}

function generateDemoScreener() {
  return ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX"].map(sym => {
    const seed = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const rng = (() => { let s = seed * 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
    return {
      symbol: sym,
      price: Math.round((100 + rng() * 400) * 100) / 100,
      change_pct: Math.round((rng() * 6 - 2.5) * 100) / 100,
      rsi: Math.round(30 + rng() * 50),
      above_200: rng() > 0.4,
      bb_pos: Math.round(rng() * 100),
    };
  });
}
