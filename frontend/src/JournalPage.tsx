import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { Link } from "react-router-dom";

interface JournalEntry {
  id: string;
  userId: string;
  timestamp: Date;
  decision: string;
  marketSentiment: string;
  confidence: string;
  priceLevel?: number;
  notes?: string;
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Form fields
  const [decision, setDecision] = useState("hold");
  const [marketSentiment, setMarketSentiment] = useState("neutral");
  const [confidence, setConfidence] = useState("medium");
  const [priceLevel, setPriceLevel] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    try {
      setLoading(true);
      const res = await api.get("/journal");
      setEntries(res.data);
    } catch (error) {
      console.error("Failed to load journal entries:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/journal", {
        decision,
        marketSentiment,
        confidence,
        priceLevel: priceLevel ? parseFloat(priceLevel) : undefined,
        notes,
      });
      // Reset form
      setDecision("hold");
      setMarketSentiment("neutral");
      setConfidence("medium");
      setPriceLevel("");
      setNotes("");
      setShowForm(false);
      loadEntries();
    } catch (error) {
      console.error("Failed to save entry:", error);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try {
      await api.delete(`/journal/${id}`);
      loadEntries();
    } catch (error) {
      console.error("Failed to delete entry:", error);
    }
  }

  const getSentimentEmoji = (sentiment: string) => {
    switch (sentiment) {
      case "very-bullish": return "🚀";
      case "bullish": return "📈";
      case "neutral": return "😐";
      case "bearish": return "📉";
      case "very-bearish": return "🔻";
      default: return "❓";
    }
  };

  const getDecisionBadgeColor = (decision: string) => {
    switch (decision) {
      case "buy": return "#4ade80";
      case "sell": return "#f87171";
      case "hold": return "#fbbf24";
      case "watch": return "#60a5fa";
      default: return "#888";
    }
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
        {/* Header */}
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
            📓 Trading Journal
          </h1>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <Link 
              to="/" 
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
              ← Tracker
            </Link>
            {user && (
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
                      onClick={logout}
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
            )}
            {!user && (
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

        {!user ? (
          <div style={{
            background: "#0a0a0a",
            border: "1px solid #222",
            padding: "48px",
            textAlign: "center"
          }}>
            <p style={{ 
            fontSize: "16px", 
            marginBottom: "24px",
            color: "#888",
            letterSpacing: "0.5px"
          }}>
            Please log in to access your trading journal
          </p>
          <Link 
            to="/login" 
            style={{
              padding: "12px 24px",
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
            Go to Login
          </Link>
        </div>
        ) : (
          <>
            {/* Add Entry Button */}
            <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: "12px 24px",
              fontSize: "11px",
              fontWeight: "600",
              color: showForm ? "#888" : "#000",
              background: showForm ? "transparent" : "#fff",
              border: "1px solid " + (showForm ? "#333" : "#fff"),
              cursor: "pointer",
              transition: "all 0.2s",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "24px"
            }}
          >
            {showForm ? "✕ Cancel" : "+ New Entry"}
          </button>

          {/* Entry Form */}
          {showForm && (
            <form onSubmit={handleSubmit} style={{
              background: "#0a0a0a",
              border: "1px solid #222",
              padding: "32px",
              marginBottom: "32px"
            }}>
              <h2 style={{ 
                marginTop: 0, 
                marginBottom: "32px",
                color: "#ffffff",
                fontSize: "20px",
                fontWeight: "300",
                letterSpacing: "2px",
                textTransform: "uppercase"
              }}>
                New Journal Entry
              </h2>
              
              <div style={{ marginBottom: "24px" }}>
                <label style={{ 
                  display: "block", 
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  marginBottom: "8px",
                  letterSpacing: "1px",
                  textTransform: "uppercase"
                }}>
                  Decision *
                </label>
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "16px",
                    border: "1px solid #333",
                    background: "#000",
                    color: "#fff",
                    fontFamily: "inherit"
                  }}
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                  <option value="hold">Hold</option>
                  <option value="watch">Watch</option>
                </select>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ 
                  display: "block", 
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  marginBottom: "8px",
                  letterSpacing: "1px",
                  textTransform: "uppercase"
                }}>
                  Market Sentiment *
                </label>
                <select
                  value={marketSentiment}
                  onChange={(e) => setMarketSentiment(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "16px",
                    border: "1px solid #333",
                    background: "#000",
                    color: "#fff",
                    fontFamily: "inherit"
                  }}
                >
                  <option value="very-bullish">🚀 Very Bullish</option>
                  <option value="bullish">📈 Bullish</option>
                  <option value="neutral">😐 Neutral</option>
                  <option value="bearish">📉 Bearish</option>
                  <option value="very-bearish">🔻 Very Bearish</option>
                </select>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ 
                  display: "block", 
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  marginBottom: "8px",
                  letterSpacing: "1px",
                  textTransform: "uppercase"
                }}>
                  Confidence Level *
                </label>
                <select
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "16px",
                    border: "1px solid #333",
                    background: "#000",
                    color: "#fff",
                    fontFamily: "inherit"
                  }}
                >
                  <option value="very-high">Very High</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="very-low">Very Low</option>
                </select>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ 
                  display: "block", 
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  marginBottom: "8px",
                  letterSpacing: "1px",
                  textTransform: "uppercase"
                }}>
                  Price Level (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={priceLevel}
                  onChange={(e) => setPriceLevel(e.target.value)}
                  placeholder="e.g., 45000.00"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "16px",
                    border: "1px solid #333",
                    background: "#000",
                    color: "#fff",
                    fontFamily: "inherit"
                  }}
                />
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ 
                  display: "block", 
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  marginBottom: "8px",
                  letterSpacing: "1px",
                  textTransform: "uppercase"
                }}>
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Write your thoughts, reasoning, or strategy..."
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "16px",
                    border: "1px solid #333",
                    background: "#000",
                    color: "#fff",
                    fontFamily: "inherit",
                    resize: "vertical"
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  padding: "12px 24px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#000",
                  background: "#fff",
                  border: "1px solid #fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textTransform: "uppercase",
                  letterSpacing: "1px"
                }}
              >
                Save Entry
              </button>
            </form>
          )}

          {/* Entries List */}
          {loading ? (
            <div style={{ 
              textAlign: "center", 
              padding: "48px",
              color: "#888",
              fontSize: "14px",
              letterSpacing: "1px"
            }}>
              Loading entries...
            </div>
          ) : entries.length === 0 ? (
            <div style={{ 
              textAlign: "center", 
              padding: "48px",
              color: "#666",
              fontSize: "14px",
              letterSpacing: "0.5px"
            }}>
              No entries yet. Click "New Entry" to start your trading journal.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid #222",
                    padding: "24px",
                    position: "relative"
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "16px"
                  }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          background: getDecisionBadgeColor(entry.decision),
                          color: "#000",
                          padding: "6px 14px",
                          fontWeight: "600",
                          textTransform: "uppercase",
                          fontSize: "11px",
                          letterSpacing: "1px"
                        }}
                      >
                        {entry.decision}
                      </span>
                      <span style={{ fontSize: "20px" }}>
                        {getSentimentEmoji(entry.marketSentiment)}
                      </span>
                      <span style={{ 
                        color: "#888", 
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>
                        {entry.marketSentiment.replace("-", " ")}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span style={{ 
                        color: "#666", 
                        fontSize: "11px",
                        letterSpacing: "0.5px"
                      }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid #333",
                          color: "#888",
                          padding: "6px 12px",
                          cursor: "pointer",
                          fontSize: "10px",
                          fontWeight: "600",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                          transition: "all 0.2s"
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.borderColor = "#ff4444";
                          e.currentTarget.style.color = "#ff4444";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.borderColor = "#333";
                          e.currentTarget.style.color = "#888";
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div style={{ 
                    marginBottom: "8px",
                    fontSize: "13px",
                    color: "#888"
                  }}>
                    <strong style={{ color: "#fff" }}>Confidence:</strong>{" "}
                    <span>
                      {entry.confidence.replace("-", " ")}
                    </span>
                  </div>

                  {entry.priceLevel && (
                    <div style={{ 
                      marginBottom: "8px",
                      fontSize: "13px",
                      color: "#888"
                    }}>
                      <strong style={{ color: "#fff" }}>Price Level:</strong>{" "}
                      <span style={{ color: "#fff" }}>
                        ${entry.priceLevel.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {entry.notes && (
                    <div style={{
                      marginTop: "16px",
                      padding: "16px",
                      background: "#000",
                      border: "1px solid #222",
                      color: "#888",
                      fontSize: "14px",
                      lineHeight: "1.6"
                    }}>
                      {entry.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
