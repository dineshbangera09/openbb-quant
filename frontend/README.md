# ◈ QUANTTERM — OpenBB Quantitative Trading System

A full-stack quantitative trading dashboard using **OpenBB** for market data and a **React** frontend for visualization and analysis.

---

## Architecture

```
quant_trading/
├── backend/
│   ├── app.py           # FastAPI + OpenBB backend
│   └── requirements.txt
└── frontend/
    └── src/
        └── App.jsx      # React dashboard (Recharts)
```

---

## Backend Setup

### 1. Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. (Optional) Configure OpenBB credentials
```bash
openbb --login   # for premium providers
```

### 3. Start the API server
```bash
uvicorn app:app --reload --port 8000
```

API endpoints:
- `GET /api/stock/{symbol}?days=365` — OHLCV + indicators + signals + backtest
- `GET /api/screener?symbols=AAPL,MSFT,...` — Multi-stock overview
- `GET /health` — Server status

---

## Frontend Setup

### 1. Create a new Vite + React project
```bash
npm create vite@latest quant-frontend -- --template react
cd quant-frontend
npm install recharts
```

### 2. Replace `src/App.jsx` with the provided file

### 3. Start dev server
```bash
npm run dev
```

> **Demo Mode** (no backend): toggle the mode button in the top right — uses client-side generated data.  
> **Live Mode**: toggle to LIVE API with the backend running on port 8000.

---

## Features

| Feature | Description |
|---|---|
| 📊 Candlestick Chart | SVG candlestick with Bollinger Bands, SMA50/200, buy/sell signals |
| 📈 Technical Indicators | RSI, MACD, Stochastic, ATR, OBV, BB Width |
| 🤖 Signal Generation | Golden/Death cross strategy with RSI confirmation |
| 🔁 Backtesting | Equity curve, Sharpe ratio, max drawdown, win rate, trade log |
| 🔍 Screener | Watchlist sidebar with % change, RSI, BB position |
| ⚡ Demo Mode | Works fully without a backend (client-side synthetic data) |

---

## Strategy Logic (in `app.py`)

```python
# BUY signal: SMA20 crosses above SMA50 AND RSI < 70
# SELL signal: SMA20 crosses below SMA50 AND RSI > 30
```

Extend `generate_signals()` to add your own strategies (mean reversion, momentum, ML, etc.)

---

## Extending with More OpenBB Data

```python
from openbb import obb

# Options chain
obb.derivatives.options.chains("AAPL")

# Fundamentals
obb.equity.fundamental.ratios("AAPL")

# News sentiment
obb.news.company("AAPL")

# Economic indicators
obb.economy.indicators(...)
```

---

## OpenBB Providers

| Provider | Data |
|---|---|
| `yfinance` | Free OHLCV, default |
| `polygon` | Professional real-time |
| `intrinio` | Fundamentals |
| `tiingo` | EOD + news |
| `fmp` | Financial statements |

Set via: `obb.equity.price.historical(..., provider="polygon")`
