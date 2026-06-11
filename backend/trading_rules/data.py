"""Kraken OHLCV data fetcher for trading rules analysis."""
import requests
import pandas as pd
from typing import Optional


KRAKEN_BASE = "https://api.kraken.com"

# Kraken interval values in minutes
_INTERVAL_MAP = {
    "1m": 1, "5m": 5, "15m": 15, "30m": 30,
    "1h": 60, "4h": 240, "1d": 1440,
}

# Kraken uses its own pair names
_SYMBOL_MAP = {
    "BTCUSDT": "XBTUSD",
    "ETHUSDT": "ETHUSD",
    "SOLUSDT": "SOLUSD",
    "BNBUSDT": "BNBUSD",
}


def fetch_ohlcv(
    symbol: str = "BTCUSDT",
    interval: str = "4h",
    limit: int = 200,
) -> pd.DataFrame:
    """
    Fetch OHLCV candlestick data from Kraken public API.

    Args:
        symbol:   Binance-style symbol, e.g. 'BTCUSDT', 'ETHUSDT'
        interval: Candle interval — '1m','5m','15m','30m','1h','4h','1d'
        limit:    Approximate number of candles to return (Kraken returns up to 720)

    Returns:
        DataFrame with DatetimeIndex (UTC) and columns:
        open, high, low, close, volume
    """
    kraken_pair = _SYMBOL_MAP.get(symbol.upper(), symbol)
    kraken_interval = _INTERVAL_MAP.get(interval)
    if kraken_interval is None:
        raise ValueError(f"Unsupported interval '{interval}'. Choose from: {list(_INTERVAL_MAP)}")

    url = f"{KRAKEN_BASE}/0/public/OHLC"
    params = {"pair": kraken_pair, "interval": kraken_interval}

    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    if data.get("error"):
        raise ValueError(f"Kraken API error: {data['error']}")

    # result key is the pair name (may differ slightly, e.g. "XXBTZUSD")
    result_key = next(k for k in data["result"] if k != "last")
    raw = data["result"][result_key]

    # Kraken OHLC format: [time, open, high, low, close, vwap, volume, count]
    df = pd.DataFrame(raw, columns=[
        "open_time", "open", "high", "low", "close",
        "vwap", "volume", "count"
    ])

    df["open_time"] = pd.to_datetime(df["open_time"], unit="s", utc=True)
    df.set_index("open_time", inplace=True)
    df.index.name = "timestamp"

    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)

    # return the most recent `limit` rows
    return df[["open", "high", "low", "close", "volume"]].tail(limit)


def fetch_4h_and_1h(
    symbol: str = "BTCUSDT",
    limit_4h: int = 200,
    limit_1h: int = 200,
):
    """
    Convenience function to fetch both 4H and 1H DataFrames ready for
    TradingRules.analyze().

    Returns:
        (df_4h, df_1h) — both DataFrames with DatetimeIndex
    """
    df_4h = fetch_ohlcv(symbol, interval="4h", limit=limit_4h)
    df_1h = fetch_ohlcv(symbol, interval="1h", limit=limit_1h)
    return df_4h, df_1h

