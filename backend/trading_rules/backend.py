"""Trading rules backend implementing 4H structure, 1H entry rules, stop loss and risk sizing."""
from typing import Optional, Dict, Any, List, Tuple
import numpy as np
import pandas as pd


def _is_pivot_high(highs: np.ndarray, idx: int, left: int = 3, right: int = 3) -> bool:
    if idx - left < 0 or idx + right >= len(highs):
        return False
    return highs[idx] == max(highs[idx - left: idx + right + 1])


def _is_pivot_low(lows: np.ndarray, idx: int, left: int = 3, right: int = 3) -> bool:
    if idx - left < 0 or idx + right >= len(lows):
        return False
    return lows[idx] == min(lows[idx - left: idx + right + 1])


def find_pivots(df: pd.DataFrame, left: int = 3, right: int = 3) -> List[Dict[str, Any]]:
    highs = df['high'].values
    lows = df['low'].values
    pivots = []
    for i in range(len(df)):
        if _is_pivot_high(highs, i, left, right):
            pivots.append({'type': 'high', 'idx': i, 'price': float(highs[i]), 'ts': df.index[i]})
        if _is_pivot_low(lows, i, left, right):
            pivots.append({'type': 'low', 'idx': i, 'price': float(lows[i]), 'ts': df.index[i]})
    pivots = sorted(pivots, key=lambda x: x['idx'])
    # compress: keep alternating sequence by timestamp
    alt = []
    for p in pivots:
        if not alt or alt[-1]['type'] != p['type']:
            alt.append(p)
        else:
            # prefer the later pivot (stronger)
            alt[-1] = p
    return alt


def evaluate_4h_structure(df_4h: pd.DataFrame) -> Optional[Dict[str, Any]]:
    pivots = find_pivots(df_4h)
    if len(pivots) < 4:
        return None

    # get last sequence of 4 alternating pivots (low,high,low,high) or inverse
    seq = pivots[-4:]
    types = [p['type'] for p in seq]
    prices = [p['price'] for p in seq]

    # bullish pattern: low1 < low2 (two HL) and high1 < high2 (two HH)
    bullish = False
    bearish = False
    if types == ['low', 'high', 'low', 'high']:
        low1, high1, low2, high2 = prices
        if low2 > low1 and high2 > high1:
            bullish = True
    if types == ['high', 'low', 'high', 'low']:
        high1, low1, high2, low2 = prices
        if low2 < low1 and high2 < high1:
            bearish = True

    if not (bullish or bearish):
        return None

    direction = 'bull' if bullish else 'bear'

    # confirmation: find impulsive candle that breaks prior structure
    # for bullish: find a 4H candle with close > previous high (high1)
    df = df_4h.reset_index()
    if direction == 'bull':
        prior_high = seq[-2]['price'] if seq[-2]['type'] == 'high' else max([p['price'] for p in seq if p['type']=='high'])
        confirm_idx = None
        for i in range(seq[-1]['idx'] + 1, len(df)):
            if df.loc[i, 'close'] > prior_high:
                confirm_idx = i
                break
    else:
        prior_low = seq[-2]['price'] if seq[-2]['type'] == 'low' else min([p['price'] for p in seq if p['type']=='low'])
        confirm_idx = None
        for i in range(seq[-1]['idx'] + 1, len(df)):
            if df.loc[i, 'close'] < prior_low:
                confirm_idx = i
                break

    if confirm_idx is None:
        return None

    confirm_row = df.loc[confirm_idx]
    # impulsive move endpoints: use last swing before impulse and the breakout close
    if direction == 'bull':
        swing_low = min([p['price'] for p in seq if p['type'] == 'low'])
        impulse_start = float(swing_low)
        impulse_end = float(confirm_row['close'])
    else:
        swing_high = max([p['price'] for p in seq if p['type'] == 'high'])
        impulse_start = float(swing_high)
        impulse_end = float(confirm_row['close'])

    return {
        'direction': direction,
        'pivots': seq,
        'confirm_index': int(confirm_idx),
        'confirm_ts': pd.to_datetime(confirm_row[df_4h.index.name if df_4h.index.name else 'index']) if False else None,
        'impulse': {'start': impulse_start, 'end': impulse_end},
        'stop_level': float(seq[-2]['price']) if direction == 'bull' else float(seq[-2]['price'])
    }


def compute_fib_level(impulse: Dict[str, float], ratio: float = 0.618) -> float:
    s = impulse['start']
    e = impulse['end']
    if e == s:
        return float(e)
    if e > s:
        return float(e - (e - s) * ratio)
    return float(e + (s - e) * ratio)


def find_1h_entry(df_1h: pd.DataFrame, fib_level: float, direction: str, tolerance: float = 0.002) -> Optional[Dict[str, Any]]:
    tol = fib_level * tolerance
    # find a 1H candle which touches the fib (low <= fib <= high) then next candle confirms by close
    for i in range(len(df_1h) - 1):
        low = float(df_1h['low'].iat[i])
        high = float(df_1h['high'].iat[i])
        if low - tol <= fib_level <= high + tol:
            # look at next candle close for confirmation
            next_close = float(df_1h['close'].iat[i + 1])
            next_open = float(df_1h['open'].iat[i + 1])
            # bullish confirmation: next candle closes bullish (close > open) and closes above previous close
            prev_close = float(df_1h['close'].iat[i])
            if direction == 'bull':
                if next_close > next_open and next_close > prev_close:
                    entry = float(df_1h['high'].iat[i + 1]) if next_close > fib_level else next_close
                    return {'entry_price': entry, 'confirm_idx': i + 1, 'confirm_ts': df_1h.index[i + 1]}
            else:
                if next_close < next_open and next_close < prev_close:
                    entry = float(df_1h['low'].iat[i + 1]) if next_close < fib_level else next_close
                    return {'entry_price': entry, 'confirm_idx': i + 1, 'confirm_ts': df_1h.index[i + 1]}
    return None


def compute_position_size(entry: float, stop: float, account_balance: float, risk_pct: float = 1.0) -> Optional[Dict[str, float]]:
    risk_amount = account_balance * (risk_pct / 100.0)
    distance = abs(entry - stop)
    if distance <= 0:
        return None
    qty = risk_amount / distance
    target_price = entry + (entry - stop) * 2 if entry > stop else entry - (stop - entry) * 2
    return {'risk_amount': risk_amount, 'distance': distance, 'quantity': qty, 'target_price': target_price}


class TradingRules:
    def __init__(self, risk_pct: float = 1.0, fib_ratio: float = 0.618, fib_tol: float = 0.002):
        self.risk_pct = risk_pct
        self.fib_ratio = fib_ratio
        self.fib_tol = fib_tol

    def analyze(self, df_4h: pd.DataFrame, df_1h: pd.DataFrame, account_balance: float) -> Optional[Dict[str, Any]]:
        if not isinstance(df_4h.index, pd.DatetimeIndex) or not isinstance(df_1h.index, pd.DatetimeIndex):
            raise ValueError('DataFrames must be indexed by pd.DatetimeIndex')

        structure = evaluate_4h_structure(df_4h)
        if structure is None:
            return None

        fib_level = compute_fib_level(structure['impulse'], ratio=self.fib_ratio)

        entry_info = find_1h_entry(df_1h, fib_level, structure['direction'], tolerance=self.fib_tol)
        if entry_info is None:
            return None

        stop_level = structure['stop_level']
        pos = compute_position_size(entry_info['entry_price'], stop_level, account_balance, risk_pct=self.risk_pct)
        if pos is None:
            return None

        rr = abs((pos['target_price'] - entry_info['entry_price']) / pos['distance']) if pos['distance'] > 0 else None

        return {
            'direction': structure['direction'],
            'fib_level': fib_level,
            'entry_price': entry_info['entry_price'],
            'entry_ts': entry_info['confirm_ts'],
            'stop_loss': stop_level,
            'position': pos,
            'RR': rr,
            'pivots': structure['pivots']
        }
