import React, { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { Link, useNavigate } from "react-router-dom";

export default function TrackerPage() {
  const [platform, setPlatform] = useState("ethereum");
  const [intervalSec, setIntervalSec] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [history, setHistory] = useState<Array<{ time: Date; data: any }>>([]);
  const [historyPeriod, setHistoryPeriod] = useState<"live" | "week" | "month">("live");
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [adminMessage, setAdminMessage] = useState<{ text: string; timestamp: Date } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [btcPriceData, setBtcPriceData] = useState<Array<{ timestamp: number; price: number }>>([]);
  const [tradingRules, setTradingRules] = useState<any[]>([]);
  const [btcPriceDays, setBtcPriceDays] = useState<7 | 30>(30);
  const [btcPriceLoading, setBtcPriceLoading] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyEmailInput, setNotifyEmailInput] = useState("");
  const [notifyEmailSaving, setNotifyEmailSaving] = useState(false);
  const [notifyEmailMsg, setNotifyEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function load() {
    try {
      setLoading(true);
      const res = await api.get(`/fees?platform=${platform}`);
      setData(res.data);
      const now = new Date();
      setLastUpdate(now);
      if (historyPeriod === "live") {
        setHistory(prev => [...prev, { time: now, data: res.data }].slice(-20));
      }
    } catch (error: any) {
      console.error("Failed to load fees:", error);
      if (error.response?.status === 401) {
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(period: "week" | "month") {
    try {
      const res = await api.get(`/history?platform=${platform}&period=${period}`);
      setHistoricalData(res.data);
    } catch (error: any) {
      console.error("Failed to load history:", error);
      if (error.response?.status === 401) {
        navigate("/login");
      }
    }
  }

  async function loadAdminMessage() {
    try {
      const res = await api.get("/admin/message");
      setAdminMessage(res.data);
    } catch (error) {
      console.error("Failed to load admin message:", error);
    }
  }

  async function loadBtcPriceData(days: number) {
    try {
      setBtcPriceLoading(true);
      const res = await api.get(`/btc-price?days=${days}`);
      setBtcPriceData(res.data);
    } catch (error) {
      console.error("Failed to load BTC price data:", error);
    } finally {
      setBtcPriceLoading(false);
    }
  }

  async function loadTradingRules() {
    try {
      const res = await api.get("/rules");
      setTradingRules(res.data);
    } catch (error) {
      console.error("Failed to load trading rules:", error);
    }
  }

  async function loadNotifyEmail() {
    try {
      const res = await api.get("/auth/notify-email");
      setNotifyEmail(res.data.notifyEmail ?? "");
      setNotifyEmailInput(res.data.notifyEmail ?? "");
    } catch (error) {
      console.error("Failed to load notify email:", error);
    }
  }

  async function saveNotifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setNotifyEmailSaving(true);
    setNotifyEmailMsg(null);
    try {
      await api.put("/auth/notify-email", { email: notifyEmailInput });
      setNotifyEmail(notifyEmailInput);
      setNotifyEmailMsg({ text: notifyEmailInput ? "Email saved — you will receive signal alerts at this address." : "Notifications disabled.", ok: true });
    } catch (error) {
      console.error("Failed to save notify email:", error);
      setNotifyEmailMsg({ text: "Failed to save. Please try again.", ok: false });
    } finally {
      setNotifyEmailSaving(false);
    }
  }

  useEffect(() => {
    setHistory([]);
    setHistoricalData([]);
    load();
    loadAdminMessage();
    loadBtcPriceData(btcPriceDays);
    loadTradingRules();
    loadNotifyEmail();
    const t = setInterval(load, intervalSec * 1000);
    return () => clearInterval(t);
  }, [platform, intervalSec]);

  useEffect(() => {
    loadBtcPriceData(btcPriceDays);
  }, [btcPriceDays]);

  useEffect(() => {
    if (historyPeriod === "week" || historyPeriod === "month") {
      loadHistory(historyPeriod);
    }
  }, [historyPeriod, platform]);

  async function subscribe() {
    const res = await api.post("/subscribe");
    window.location.href = res.data.url;
  }

  const formatFee = (key: string, value: any) => {
    if (platform === "ethereum") {
      return `${value} Gwei`;
    }
    return `${value} sat/vB`;
  };


  const renderBtcRulesChart = () => {
    if (btcPriceData.length < 2) return null;

    const bitcoinRules = tradingRules.filter(r => r.platform === "bitcoin" && r.isActive);

    const svgWidth = 1000;
    const height = 400;
    const paddingLeft = 80;
    const paddingRight = 20;
    const paddingTop = 24;
    const paddingBottom = 44;
    const chartWidth = svgWidth - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Downsample to max 60 points
    let displayData = btcPriceData;
    if (displayData.length > 60) {
      const step = Math.ceil(displayData.length / 60);
      displayData = displayData.filter((_, i) => i % step === 0);
    }

    const prices = displayData.map(d => d.price);

    // Include rule prices in Y range so lines are always visible
    const rulePrices: number[] = bitcoinRules.flatMap(r => [
      r.entryPrice,
      r.stopLossPrice,
      r.entryPrice && r.maxLossPercent ? r.entryPrice * (1 - r.maxLossPercent / 100) : undefined,
    ].filter((v): v is number => typeof v === "number" && v > 0));

    const allPrices = [...prices, ...rulePrices];
    const rawMin = Math.min(...allPrices);
    const rawMax = Math.max(...allPrices);
    const pad = (rawMax - rawMin) * 0.05 || rawMax * 0.02;
    const minPrice = rawMin - pad;
    const maxPrice = rawMax + pad;

    const xScale = (i: number) => paddingLeft + (i / (displayData.length - 1)) * chartWidth;
    const yScale = (price: number) =>
      paddingTop + ((maxPrice - price) / (maxPrice - minPrice)) * chartHeight;

    const pathD = displayData
      .map((point, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(point.price).toFixed(1)}`)
      .join(" ");

    const xLabelIndices = [
      0,
      Math.floor(displayData.length / 4),
      Math.floor(displayData.length / 2),
      Math.floor((3 * displayData.length) / 4),
      displayData.length - 1,
    ];

    const entryColor = "#3b82f6";
    const stopLossColor = "#ef4444";
    const maxLossColor = "#f97316";

    const formatPrice = (p: number) =>
      p >= 1000 ? `$${(p / 1000).toFixed(1)}k` : `$${p.toFixed(0)}`;

    return (
      <div style={{ background: "#0a0a0a", border: "1px solid #222", padding: "32px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <h2 style={{ fontSize: "11px", fontWeight: "600", color: "#888", letterSpacing: "1px", textTransform: "uppercase", margin: 0 }}>
            Bitcoin Price + Trading Rules
          </h2>
          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Legend */}
            <div style={{ display: "flex", gap: "12px" }}>
              {[
                { color: "#f59e0b", label: "Price" },
                { color: entryColor, label: "Entry" },
                { color: maxLossColor, label: "Max Loss" },
                { color: stopLossColor, label: "Stop Loss" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={color} strokeWidth="2" strokeDasharray={label === "Price" ? "0" : "5,3"} /></svg>
                  <span style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
                </div>
              ))}
            </div>
            {/* Day selector */}
            {([7, 30] as const).map(d => (
              <button
                key={d}
                onClick={() => setBtcPriceDays(d)}
                style={{
                  padding: "8px 16px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: btcPriceDays === d ? "#000" : "#888",
                  background: btcPriceDays === d ? "#fff" : "transparent",
                  border: "1px solid #333",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {btcPriceLoading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#666", fontSize: "14px", textTransform: "uppercase", letterSpacing: "2px" }}>
            Loading...
          </div>
        ) : (
          <div style={{ position: "relative", width: "100%", height: `${height}px` }}>
            <svg width="100%" height={height} viewBox={`0 0 ${svgWidth} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
              <defs>
                <linearGradient id="btcGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid lines + Y labels */}
              {Array.from({ length: 6 }, (_, i) => {
                const y = paddingTop + (i / 5) * chartHeight;
                const price = maxPrice - (i / 5) * (maxPrice - minPrice);
                return (
                  <g key={`grid-${i}`}>
                    <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="#1a1a1a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fill="#555" fontSize="11" fontFamily="monospace">
                      {formatPrice(price)}
                    </text>
                  </g>
                );
              })}

              {/* X-axis date labels */}
              {xLabelIndices.map(i => {
                if (i >= displayData.length) return null;
                const x = xScale(i);
                const date = new Date(displayData[i].timestamp);
                const label = `${date.getMonth() + 1}/${date.getDate()}`;
                return (
                  <text key={`x-${i}`} x={x} y={height - 10} textAnchor="middle" fill="#555" fontSize="11" fontFamily="monospace">
                    {label}
                  </text>
                );
              })}

              {/* Price area fill */}
              <path
                d={`${pathD} L${xScale(displayData.length - 1).toFixed(1)},${(paddingTop + chartHeight).toFixed(1)} L${xScale(0).toFixed(1)},${(paddingTop + chartHeight).toFixed(1)} Z`}
                fill="url(#btcGradient)"
              />

              {/* Price line */}
              <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2" vectorEffect="non-scaling-stroke" />

              {/* Current price dot */}
              <circle
                cx={xScale(displayData.length - 1)}
                cy={yScale(displayData[displayData.length - 1].price)}
                r="4"
                fill="#f59e0b"
                vectorEffect="non-scaling-stroke"
              />

              {/* Trading rule lines */}
              {bitcoinRules.flatMap((rule, idx) => {
                const lines: React.ReactNode[] = [];

                const addLine = (price: number, color: string, label: string, key: string) => {
                  const y = yScale(price);
                  if (y < paddingTop || y > paddingTop + chartHeight) return;
                  lines.push(
                    <g key={key}>
                      <line
                        x1={paddingLeft}
                        y1={y}
                        x2={svgWidth - paddingRight}
                        y2={y}
                        stroke={color}
                        strokeWidth="1.5"
                        strokeDasharray="6,4"
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect x={paddingLeft} y={y - 16} width={svgWidth - paddingLeft - paddingRight} height="14" fill="transparent" />
                      <rect x={svgWidth - paddingRight - 220} y={y - 15} width="218" height="13" fill="#0a0a0a" opacity="0.85" />
                      <text x={svgWidth - paddingRight - 6} y={y - 4} textAnchor="end" fill={color} fontSize="10" fontFamily="monospace">
                        {rule.ruleName} — {label} {formatPrice(price)}
                      </text>
                    </g>
                  );
                };

                if (rule.entryPrice) {
                  addLine(rule.entryPrice, entryColor, "Entry", `entry-${idx}`);
                }
                if (rule.stopLossPrice) {
                  addLine(rule.stopLossPrice, stopLossColor, "Stop Loss", `sl-${idx}`);
                }
                if (rule.entryPrice && rule.maxLossPercent) {
                  const maxLossPrice = rule.entryPrice * (1 - rule.maxLossPercent / 100);
                  addLine(maxLossPrice, maxLossColor, `-${rule.maxLossPercent}%`, `ml-${idx}`);
                }

                return lines;
              })}
            </svg>
          </div>
        )}

        {bitcoinRules.length === 0 && !btcPriceLoading && (
          <div style={{ textAlign: "center", padding: "12px 0 0", color: "#444", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px" }}>
            No active Bitcoin trading rules — add rules in Trading Rules to overlay them here
          </div>
        )}
      </div>
    );
  };

  const renderChart = () => {
    const dataToDisplay = historyPeriod === "live" ? history : historicalData.map(item => ({
      time: new Date(item.timestamp),
      data: { ...item, timestamp: undefined }
    }));

    if (dataToDisplay.length < 2) return null;

    const height = 320;
    const padding = 40;
    const metricKey = platform === "ethereum" ? "propose" : "fastest";
    const values = dataToDisplay
      .map(point => parseFloat(point.data[metricKey]))
      .filter(v => !isNaN(v));

    if (values.length < 2) return null;

    // Build candles from consecutive points
    const candles = values.slice(1).map((close, index) => {
      const open = values[index];
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      return { open, close, high, low };
    });

    const minVal = Math.min(...candles.map(c => c.low));
    const maxVal = Math.max(...candles.map(c => c.high));

    const yScale = (val: number) => {
      return height - padding - ((val - minVal) / (maxVal - minVal || 1)) * (height - 2 * padding);
    };

    const chartWidth = 1000 - 2 * padding;
    const candleWidth = Math.max(6, chartWidth / candles.length * 0.6);

    return (
      <div style={{
        background: "#0a0a0a",
        border: "1px solid #222",
        padding: "32px",
        marginBottom: "24px"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px"
        }}>
          <h2 style={{
            fontSize: "11px",
            fontWeight: "600",
            color: "#888",
            letterSpacing: "1px",
            textTransform: "uppercase",
            margin: 0
          }}>
            {`Fee Candles (${metricKey})`} — {historyPeriod === "live" ? `Last ${candles.length} updates` : historyPeriod}
          </h2>
          <div style={{ display: "flex", gap: "8px" }}>
            {["live", "week", "month"].map(period => (
              <button
                key={period}
                onClick={() => setHistoryPeriod(period as any)}
                style={{
                  padding: "8px 16px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: historyPeriod === period ? "#000" : "#888",
                  background: historyPeriod === period ? "#fff" : "transparent",
                  border: "1px solid #333",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textTransform: "uppercase",
                  letterSpacing: "1px"
                }}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", width: "100%", height: `${height}px` }}>
          <svg 
            width="100%" 
            height={height} 
            viewBox={`0 0 1000 ${height}`}
            preserveAspectRatio="none"
            style={{ display: "block" }}
          >
            {/* Grid lines */}
            {[0, 1, 2, 3, 4].map(i => {
              const y = padding + (i * (height - 2 * padding) / 4);
              return (
                <line
                  key={`grid-${i}`}
                  x1={padding}
                  y1={y}
                  x2={1000 - padding}
                  y2={y}
                  stroke="#222"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {/* Candles */}
            {candles.map((candle, index) => {
              const xCenter = padding + (index + 0.5) * (chartWidth / candles.length);
              const yOpen = yScale(candle.open);
              const yClose = yScale(candle.close);
              const yHigh = yScale(candle.high);
              const yLow = yScale(candle.low);
              const isUp = candle.close >= candle.open;
              const color = isUp ? "#22c55e" : "#ef4444";
              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

              return (
                <g key={`candle-${index}`}>
                  <line
                    x1={xCenter}
                    y1={yHigh}
                    x2={xCenter}
                    y2={yLow}
                    stroke={color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={xCenter - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    stroke={color}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}

            {/* Y-axis labels */}
            {[0, 1, 2, 3, 4].map(i => {
              const y = padding + (i * (height - 2 * padding) / 4);
              const val = maxVal - (i * (maxVal - minVal) / 4);
              return (
                <text
                  key={`y-label-${i}`}
                  x={padding - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="#666"
                  fontSize="12"
                  fontFamily="monospace"
                >
                  {val.toFixed(1)}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  const formatTime = (date: Date | null) => {
    if (!date) return "";
    return date.toLocaleTimeString();
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000000",
      padding: "40px 20px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      <div style={{
        maxWidth: "1200px",
        margin: "0 auto"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "40px",
          paddingBottom: "20px",
          borderBottom: "1px solid #333"
        }}>
          <h1 style={{
            color: "#ffffff",
            fontSize: "32px",
            fontWeight: "300",
            letterSpacing: "2px",
            textTransform: "uppercase",
            margin: 0
          }}>
            Crypto Fee Tracker
          </h1>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            {lastUpdate && (
              <div style={{
                color: "#666",
                fontSize: "14px",
                fontFamily: "monospace"
              }}>
                Last update: {formatTime(lastUpdate)}
              </div>
            )}
            {user?.isAdmin && (
              <Link
                to="/admin"
                style={{
                  padding: "8px 16px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  background: "transparent",
                  border: "1px solid #333",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  textDecoration: "none",
                  display: "inline-block"
                }}
              >
                Admin Portal
              </Link>
            )}
            {user && (
              <Link
                to="/journal"
                style={{
                  padding: "8px 16px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  background: "transparent",
                  border: "1px solid #333",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  textDecoration: "none",
                  display: "inline-block",
                  marginLeft: "8px"
                }}
              >
                📓 Journal
              </Link>
            )}
            {user ? (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#888",
                    background: "transparent",
                    border: "1px solid #333",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textTransform: "uppercase",
                    letterSpacing: "1px"
                  }}
                >
                  {user.username}
                </button>
                {showUserMenu && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "8px",
                    background: "#0a0a0a",
                    border: "1px solid #333",
                    minWidth: "200px",
                    zIndex: 1000
                  }}>
                    <button
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                        navigate("/login");
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "#fff",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        textAlign: "left"
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                style={{
                  padding: "8px 16px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#000",
                  background: "#fff",
                  border: "1px solid #fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  textDecoration: "none",
                  display: "inline-block"
                }}
              >
                Login
              </Link>
            )}
          </div>
        </div>

        {/* User Message Banner */}
        {adminMessage && (
          <div style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            border: "1px solid #764ba2",
            padding: "16px 24px",
            marginBottom: "24px",
            borderRadius: "4px"
          }}>
            <div style={{
              fontSize: "11px",
              fontWeight: "600",
              color: "rgba(255,255,255,0.8)",
              letterSpacing: "1px",
              textTransform: "uppercase",
              marginBottom: "8px"
            }}>
              📢 Admin Portal
            </div>
            <div style={{
              fontSize: "14px",
              color: "#fff",
              lineHeight: "1.6"
            }}>
              {adminMessage.text}
            </div>
          </div>
        )}

        <div style={{
          background: "#0a0a0a",
          border: "1px solid #222",
          padding: "32px",
          marginBottom: "24px"
        }}>
          <div style={{
            display: "flex",
            gap: "24px",
            marginBottom: "32px",
            flexWrap: "wrap"
          }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={{
                display: "block",
                fontSize: "11px",
                fontWeight: "600",
                color: "#888",
                marginBottom: "8px",
                letterSpacing: "1px",
                textTransform: "uppercase"
              }}>
                Platform
              </label>
              <select 
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "16px",
                  border: "1px solid #333",
                  backgroundColor: "#000",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  outline: "none"
                }}
              >
                <option value="ethereum">Ethereum</option>
                <option value="bitcoin">Bitcoin</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={{
                display: "block",
                fontSize: "11px",
                fontWeight: "600",
                color: "#888",
                marginBottom: "8px",
                letterSpacing: "1px",
                textTransform: "uppercase"
              }}>
                Refresh Rate
              </label>
              <select 
                value={intervalSec}
                onChange={e => setIntervalSec(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "16px",
                  border: "1px solid #333",
                  backgroundColor: "#000",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  outline: "none"
                }}
              >
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: "200px", display: "flex", alignItems: "flex-end" }}>
              <button 
                onClick={load}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#000",
                  background: "#fff",
                  border: "1px solid #fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textTransform: "uppercase",
                  letterSpacing: "1px"
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = "#000";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.color = "#000";
                }}
              >
                Update Now
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{
              textAlign: "center",
              padding: "60px",
              color: "#666",
              fontSize: "14px",
              textTransform: "uppercase",
              letterSpacing: "2px"
            }}>
              Loading...
            </div>
          ) : data ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1px",
              background: "#222",
              border: "1px solid #222"
            }}>
              {Object.entries(data).map(([key, value]) => (
                <div key={key} style={{
                  padding: "32px 24px",
                  background: "#0a0a0a",
                  borderBottom: "1px solid #222"
                }}>
                  <div style={{
                    fontSize: "11px",
                    color: "#666",
                    marginBottom: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "1.5px",
                    fontWeight: "600"
                  }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div style={{
                    fontSize: "36px",
                    fontWeight: "200",
                    color: "#fff",
                    fontFamily: "monospace"
                  }}>
                    {formatFee(key, value)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: "center",
              padding: "60px",
              color: "#666"
            }}>
              No data available
            </div>
          )}
        </div>

        {renderBtcRulesChart()}

        {renderChart()}

        {/* Email Notifications Settings */}
        <div style={{
          background: "#0a0a0a",
          border: "1px solid #222",
          padding: "32px",
          marginBottom: "24px"
        }}>
          <h2 style={{
            fontSize: "11px",
            fontWeight: "600",
            color: "#888",
            letterSpacing: "1px",
            textTransform: "uppercase",
            margin: "0 0 8px 0"
          }}>
            📧 Email Notifications
          </h2>
          <p style={{ fontSize: "13px", color: "#555", marginBottom: "20px", lineHeight: "1.6" }}>
            Receive an email whenever a trading signal is triggered. Leave blank to disable notifications.
          </p>
          {notifyEmail && (
            <div style={{
              marginBottom: "16px",
              padding: "10px 16px",
              background: "#0d1a0d",
              border: "1px solid #1a3a1a",
              fontSize: "12px",
              color: "#4ade80"
            }}>
              ✅ Notifications active → <span style={{ fontFamily: "monospace" }}>{notifyEmail}</span>
            </div>
          )}
          <form onSubmit={saveNotifyEmail} style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="email"
              value={notifyEmailInput}
              onChange={e => { setNotifyEmailInput(e.target.value); setNotifyEmailMsg(null); }}
              placeholder="your@email.com"
              style={{
                flex: "1",
                minWidth: "220px",
                padding: "12px 16px",
                fontSize: "14px",
                border: "1px solid #333",
                backgroundColor: "#000",
                color: "#fff",
                outline: "none",
                fontFamily: "inherit"
              }}
            />
            <button
              type="submit"
              disabled={notifyEmailSaving}
              style={{
                padding: "12px 24px",
                fontSize: "11px",
                fontWeight: "600",
                color: "#000",
                background: notifyEmailSaving ? "#555" : "#fff",
                border: "1px solid #fff",
                cursor: notifyEmailSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "1px",
                transition: "all 0.2s"
              }}
            >
              {notifyEmailSaving ? "Saving…" : "Save"}
            </button>
            {notifyEmail && (
              <button
                type="button"
                onClick={() => { setNotifyEmailInput(""); }}
                style={{
                  padding: "12px 24px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#f87171",
                  background: "transparent",
                  border: "1px solid #333",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "1px"
                }}
              >
                Clear
              </button>
            )}
          </form>
          {notifyEmailMsg && (
            <div style={{
              marginTop: "12px",
              fontSize: "12px",
              color: notifyEmailMsg.ok ? "#4ade80" : "#f87171"
            }}>
              {notifyEmailMsg.text}
            </div>
          )}
        </div>

        <button 
          onClick={subscribe}
          style={{
            width: "100%",
            padding: "20px",
            fontSize: "12px",
            fontWeight: "600",
            color: "#fff",
            background: "#000",
            border: "1px solid #333",
            cursor: "pointer",
            transition: "all 0.2s",
            textTransform: "uppercase",
            letterSpacing: "2px"
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = "#fff";
            e.currentTarget.style.color = "#000";
            e.currentTarget.style.borderColor = "#fff";
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = "#000";
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.borderColor = "#333";
          }}
        >
          Subscribe with Stripe
        </button>

        <div style={{
          textAlign: "center",
          color: "#444",
          marginTop: "40px",
          fontSize: "11px",
          letterSpacing: "1px",
          textTransform: "uppercase"
        }}>
          Real-time blockchain network fees
        </div>
      </div>
    </div>
  );
}
