"""
OpenBB Quantitative Trading System - Backend API
Run: pip install openbb fastapi uvicorn pandas numpy scipy ta
Start: uvicorn app:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings("ignore")

app = FastAPI(title="Quant Trading API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── OpenBB Data Fetching ──────────────────────────────────────────────────────

def get_stock_data(symbol: str, days: int = 365):
    """Fetch OHLCV data using OpenBB"""
    try:
        from openbb import obb
        end = datetime.now()
        start = end - timedelta(days=days)
        result = obb.equity.price.historical(
            symbol=symbol,
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
            provider="yfinance"
        )
        df = result.to_df()
        df.index = pd.to_datetime(df.index)
        return df
    except Exception as e:
        # Fallback: generate synthetic data for demo
        print(f"OpenBB error: {e} — using synthetic data")
        return generate_synthetic_data(symbol, days)


def generate_synthetic_data(symbol: str, days: int = 365) -> pd.DataFrame:
    """Generate realistic synthetic OHLCV data as fallback"""
    np.random.seed(hash(symbol) % 2**32)
    dates = pd.bdate_range(end=datetime.now(), periods=days)
    price = 150.0
    prices = []
    for _ in dates:
        ret = np.random.normal(0.0003, 0.015)
        price *= (1 + ret)
        prices.append(price)
    prices = np.array(prices)
    df = pd.DataFrame({
        "open":   prices * (1 + np.random.uniform(-0.005, 0.005, len(prices))),
        "high":   prices * (1 + np.abs(np.random.normal(0, 0.008, len(prices)))),
        "low":    prices * (1 - np.abs(np.random.normal(0, 0.008, len(prices)))),
        "close":  prices,
        "volume": np.random.randint(5_000_000, 30_000_000, len(prices)).astype(float),
    }, index=dates)
    return df


# ─── Technical Indicators ─────────────────────────────────────────────────────

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    close = df["close"]
    high, low, vol = df["high"], df["low"], df["volume"]

    # Moving averages
    df["sma_20"]  = close.rolling(20).mean()
    df["sma_50"]  = close.rolling(50).mean()
    df["sma_200"] = close.rolling(200).mean()
    df["ema_12"]  = close.ewm(span=12, adjust=False).mean()
    df["ema_26"]  = close.ewm(span=26, adjust=False).mean()

    # MACD
    df["macd"]        = df["ema_12"] - df["ema_26"]
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"]   = df["macd"] - df["macd_signal"]

    # RSI
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - (100 / (1 + rs))

    # Bollinger Bands
    mid = close.rolling(20).mean()
    std = close.rolling(20).std()
    df["bb_upper"] = mid + 2 * std
    df["bb_middle"] = mid
    df["bb_lower"]  = mid - 2 * std
    df["bb_width"]  = (df["bb_upper"] - df["bb_lower"]) / mid

    # ATR
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low  - close.shift()).abs()
    ], axis=1).max(axis=1)
    df["atr"] = tr.rolling(14).mean()

    # Volume indicators
    df["vwap"]    = (close * vol).rolling(20).sum() / vol.rolling(20).sum()
    df["vol_sma"] = vol.rolling(20).mean()
    df["obv"]     = (np.sign(close.diff()) * vol).fillna(0).cumsum()

    # Stochastic
    low_14  = low.rolling(14).min()
    high_14 = high.rolling(14).max()
    df["stoch_k"] = 100 * (close - low_14) / (high_14 - low_14 + 1e-10)
    df["stoch_d"] = df["stoch_k"].rolling(3).mean()

    return df


# ─── Strategy Signal Generation ───────────────────────────────────────────────

def generate_signals(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["signal"] = 0

    # Golden/Death cross
    df.loc[(df["sma_20"] > df["sma_50"]) & (df["sma_20"].shift(1) <= df["sma_50"].shift(1)), "signal"] = 1
    df.loc[(df["sma_20"] < df["sma_50"]) & (df["sma_20"].shift(1) >= df["sma_50"].shift(1)), "signal"] = -1

    # RSI oversold/overbought confirm
    df.loc[(df["signal"] == 1)  & (df["rsi"] > 70), "signal"] = 0
    df.loc[(df["signal"] == -1) & (df["rsi"] < 30), "signal"] = 0

    return df


# ─── Backtest ─────────────────────────────────────────────────────────────────

def backtest(df: pd.DataFrame, initial_capital: float = 100_000.0) -> dict:
    signals = generate_signals(df).dropna(subset=["sma_20", "sma_50"])
    position = 0
    cash = initial_capital
    equity_curve = []
    trades = []

    for date, row in signals.iterrows():
        price = row["close"]
        if row["signal"] == 1 and position == 0:
            shares = int(cash * 0.95 / price)
            if shares > 0:
                position = shares
                cash -= shares * price
                trades.append({"date": str(date.date()), "type": "BUY", "price": round(price, 2), "shares": shares})
        elif row["signal"] == -1 and position > 0:
            cash += position * price
            trades.append({"date": str(date.date()), "type": "SELL", "price": round(price, 2), "shares": position})
            position = 0
        equity_curve.append({"date": str(date.date()), "equity": round(cash + position * price, 2)})

    final_equity = cash + position * signals.iloc[-1]["close"]
    total_return = (final_equity - initial_capital) / initial_capital * 100

    # Buy & hold return
    bh_return = (signals.iloc[-1]["close"] - signals.iloc[0]["close"]) / signals.iloc[0]["close"] * 100

    # Sharpe ratio
    eq_vals = pd.Series([e["equity"] for e in equity_curve])
    daily_ret = eq_vals.pct_change().dropna()
    sharpe = (daily_ret.mean() / daily_ret.std() * np.sqrt(252)) if daily_ret.std() > 0 else 0

    # Max drawdown
    rolling_max = eq_vals.cummax()
    drawdown = (eq_vals - rolling_max) / rolling_max
    max_dd = drawdown.min() * 100

    win_trades = [t for i, t in enumerate(trades) if t["type"] == "SELL" and i > 0 and trades[i-1]["type"] == "BUY" and t["price"] > trades[i-1]["price"]]
    sell_trades = [t for t in trades if t["type"] == "SELL"]

    return {
        "total_return": round(total_return, 2),
        "buy_hold_return": round(bh_return, 2),
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown": round(max_dd, 2),
        "num_trades": len(sell_trades),
        "win_rate": round(len(win_trades) / max(len(sell_trades), 1) * 100, 1),
        "final_equity": round(final_equity, 2),
        "equity_curve": equity_curve[-252:],  # last year
        "trades": trades[-20:],
    }


# ─── API Routes ───────────────────────────────────────────────────────────────

@app.get("/api/stock/{symbol}")
def get_stock(symbol: str, days: int = 365):
    symbol = symbol.upper()
    try:
        df = get_stock_data(symbol, days)
        df = compute_indicators(df)
        df = generate_signals(df)
        df = df.dropna(subset=["sma_20"])
        recent = df.tail(100)

        def row_to_dict(row, date):
            return {
                "date":       str(date.date()),
                "open":       round(row.open, 2),
                "high":       round(row.high, 2),
                "low":        round(row.low, 2),
                "close":      round(row.close, 2),
                "volume":     int(row.volume),
                "sma_20":     round(row.sma_20, 2) if not np.isnan(row.sma_20) else None,
                "sma_50":     round(row.sma_50, 2) if not np.isnan(row.sma_50) else None,
                "sma_200":    round(row.sma_200, 2) if not np.isnan(row.sma_200) else None,
                "bb_upper":   round(row.bb_upper, 2) if not np.isnan(row.bb_upper) else None,
                "bb_middle":  round(row.bb_middle, 2) if not np.isnan(row.bb_middle) else None,
                "bb_lower":   round(row.bb_lower, 2) if not np.isnan(row.bb_lower) else None,
                "rsi":        round(row.rsi, 2) if not np.isnan(row.rsi) else None,
                "macd":       round(row.macd, 4) if not np.isnan(row.macd) else None,
                "macd_signal":round(row.macd_signal, 4) if not np.isnan(row.macd_signal) else None,
                "macd_hist":  round(row.macd_hist, 4) if not np.isnan(row.macd_hist) else None,
                "stoch_k":    round(row.stoch_k, 2) if not np.isnan(row.stoch_k) else None,
                "stoch_d":    round(row.stoch_d, 2) if not np.isnan(row.stoch_d) else None,
                "atr":        round(row.atr, 4) if not np.isnan(row.atr) else None,
                "obv":        round(row.obv, 0),
                "signal":     int(row.signal),
            }

        candles = [row_to_dict(row, date) for date, row in recent.iterrows()]

        latest = df.iloc[-1]
        prev   = df.iloc[-2]
        change    = latest.close - prev.close
        change_pct = change / prev.close * 100

        summary = {
            "symbol":      symbol,
            "price":       round(latest.close, 2),
            "change":      round(change, 2),
            "change_pct":  round(change_pct, 2),
            "high_52w":    round(df["high"].tail(252).max(), 2),
            "low_52w":     round(df["low"].tail(252).min(), 2),
            "avg_volume":  int(df["volume"].tail(20).mean()),
            "rsi":         round(latest.rsi, 1) if not np.isnan(latest.rsi) else None,
            "atr":         round(latest.atr, 2) if not np.isnan(latest.atr) else None,
        }

        backtest_result = backtest(df)

        return {"summary": summary, "candles": candles, "backtest": backtest_result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/screener")
def screener(symbols: str = "AAPL,MSFT,GOOGL,AMZN,NVDA,TSLA,META,NFLX"):
    results = []
    for sym in symbols.split(","):
        sym = sym.strip().upper()
        try:
            df = get_stock_data(sym, 100)
            df = compute_indicators(df)
            latest = df.dropna(subset=["rsi"]).iloc[-1]
            prev   = df.iloc[-2]
            change_pct = (latest.close - prev.close) / prev.close * 100
            results.append({
                "symbol":     sym,
                "price":      round(latest.close, 2),
                "change_pct": round(change_pct, 2),
                "rsi":        round(latest.rsi, 1),
                "above_200":  bool(latest.close > latest.sma_200) if not np.isnan(latest.sma_200) else None,
                "bb_pos":     round((latest.close - latest.bb_lower) / (latest.bb_upper - latest.bb_lower) * 100, 1) if not np.isnan(latest.bb_upper) else None,
            })
        except:
            pass
    return results


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}
