import { useEffect, useState } from "react";
import { api } from "./api";

interface JournalEntry {
  id: string;
  userId: string;
  timestamp: string;
  decision: string;
  marketSentiment: string;
  confidence: string;
  priceLevel?: number;
  notes?: string;
}

interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  notifyEmail?: string;
}

export default function AdminPage() {
  const [adminMessage, setAdminMessage] = useState<{ text: string; timestamp: Date } | null>(null);
  const [adminMessageInput, setAdminMessageInput] = useState("");
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [editingEmailUserId, setEditingEmailUserId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");

  async function loadAdminMessage() {
    try {
      const res = await api.get("/admin/message");
      setAdminMessage(res.data);
    } catch (error) {
      console.error("Failed to load admin message:", error);
    }
  }

  async function loadJournals() {
    try {
      const res = await api.get("/admin/journals");
      setJournals(res.data);
    } catch (error) {
      console.error("Failed to load journals:", error);
    }
  }

  async function loadUsers() {
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data);
    } catch (error) {
      console.error("Failed to load users:", error);
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

  async function setAdminMessageFunc() {
    try {
      const res = await api.post("/admin/message", { text: adminMessageInput });
      setAdminMessage(res.data.message);
      setAdminMessageInput("");
      alert("Message set successfully!");
    } catch (error) {
      console.error("Failed to set admin message:", error);
      alert("Failed to set message");
    }
  }

  async function clearAdminMessage() {
    try {
      await api.delete("/admin/message");
      setAdminMessage(null);
      alert("Message cleared successfully!");
    } catch (error) {
      console.error("Failed to clear admin message:", error);
      alert("Failed to clear message");
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/admin/users", {
        username: newUsername,
        password: newPassword,
        isAdmin: newIsAdmin
      });
      alert("User created successfully!");
      setNewUsername("");
      setNewPassword("");
      setNewIsAdmin(false);
      setShowCreateUser(false);
      loadUsers();
    } catch (error: any) {
      console.error("Failed to create user:", error);
      alert(error.response?.data?.error || "Failed to create user");
    }
  }

  async function saveUserNotifyEmail(userId: string) {
    try {
      await api.put(`/admin/users/${userId}/notify-email`, { email: editingEmailValue });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, notifyEmail: editingEmailValue.trim() || undefined } : u));
      setEditingEmailUserId(null);
    } catch (error: any) {
      console.error("Failed to save notify email:", error);
      alert(error.response?.data?.error || "Failed to save email");
    }
  }

  useEffect(() => {
    loadAdminMessage();
    loadJournals();
    loadUsers();
  }, []);

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
            Admin Panel
          </h1>
          <a
            href="/"
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
            ← Back to Tracker
          </a>
        </div>

        {/* Admin Panel */}
        <div style={{
          background: "#0a0a0a",
          border: "1px solid #333",
          padding: "32px",
          marginBottom: "24px"
        }}>
          <h2 style={{
            fontSize: "16px",
            fontWeight: "600",
            color: "#fff",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginTop: 0,
            marginBottom: "8px"
          }}>
            User Guidance Message
          </h2>
          <p style={{
            fontSize: "13px",
            color: "#888",
            marginBottom: "24px",
            lineHeight: "1.6"
          }}>
            Set a message to display to all users on the main tracker page. This can be used to communicate important updates, maintenance notices, or general guidance.
          </p>
          
          <div style={{ marginBottom: "16px" }}>
            <label style={{
              display: "block",
              fontSize: "11px",
              fontWeight: "600",
              color: "#888",
              marginBottom: "8px",
              letterSpacing: "1px",
              textTransform: "uppercase"
            }}>
              Message Text
            </label>
            <textarea
              value={adminMessageInput}
              onChange={e => setAdminMessageInput(e.target.value)}
              placeholder="Enter a guidance message for users..."
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "16px",
                fontSize: "14px",
                border: "1px solid #333",
                backgroundColor: "#000",
                color: "#fff",
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                lineHeight: "1.6"
              }}
            />
          </div>
          
          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            <button
              onClick={setAdminMessageFunc}
              disabled={!adminMessageInput.trim()}
              style={{
                padding: "14px 28px",
                fontSize: "11px",
                fontWeight: "600",
                color: adminMessageInput.trim() ? "#000" : "#333",
                background: adminMessageInput.trim() ? "#fff" : "#111",
                border: "1px solid #333",
                cursor: adminMessageInput.trim() ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                textTransform: "uppercase",
                letterSpacing: "1px"
              }}
            >
              Publish Message
            </button>
            <button
              onClick={clearAdminMessage}
              disabled={!adminMessage}
              style={{
                padding: "14px 28px",
                fontSize: "11px",
                fontWeight: "600",
                color: adminMessage ? "#fff" : "#333",
                background: "transparent",
                border: "1px solid #333",
                cursor: adminMessage ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                textTransform: "uppercase",
                letterSpacing: "1px"
              }}
            >
              Clear Message
            </button>
          </div>

          {adminMessage && (
            <div>
              <h3 style={{
                fontSize: "11px",
                fontWeight: "600",
                color: "#888",
                letterSpacing: "1px",
                textTransform: "uppercase",
                marginTop: 0,
                marginBottom: "12px"
              }}>
                Currently Active Message
              </h3>
              <div style={{
                padding: "16px",
                background: "#000",
                border: "1px solid #333",
                borderLeft: "3px solid #667eea"
              }}>
                <div style={{
                  fontSize: "14px",
                  color: "#fff",
                  lineHeight: "1.6",
                  marginBottom: "8px"
                }}>
                  {adminMessage.text}
                </div>
                <div style={{
                  fontSize: "11px",
                  color: "#666",
                  fontFamily: "monospace"
                }}>
                  Set on: {new Date(adminMessage.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Users Section */}
        <div style={{
          background: "#0a0a0a",
          border: "1px solid #333",
          padding: "32px",
          marginBottom: "24px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <h2 style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#fff",
              letterSpacing: "1px",
              textTransform: "uppercase",
              margin: 0
            }}>
              User Management
            </h2>
            <button
              onClick={() => setShowCreateUser(!showCreateUser)}
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
                letterSpacing: "1px"
              }}
            >
              {showCreateUser ? "Cancel" : "+ Create User"}
            </button>
          </div>

          {showCreateUser && (
            <form onSubmit={createUser} style={{
              background: "#000",
              border: "1px solid #333",
              padding: "24px",
              marginBottom: "24px"
            }}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  marginBottom: "8px",
                  letterSpacing: "1px",
                  textTransform: "uppercase"
                }}>
                  Username
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "14px",
                    border: "1px solid #333",
                    backgroundColor: "#000",
                    color: "#fff",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#888",
                  marginBottom: "8px",
                  letterSpacing: "1px",
                  textTransform: "uppercase"
                }}>
                  Password (min 6 characters)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "14px",
                    border: "1px solid #333",
                    backgroundColor: "#000",
                    color: "#fff",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: "14px",
                  color: "#fff",
                  cursor: "pointer"
                }}>
                  <input
                    type="checkbox"
                    checked={newIsAdmin}
                    onChange={e => setNewIsAdmin(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Admin privileges
                </label>
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
                Create User
              </button>
            </form>
          )}

          <div>
            <h3 style={{
              fontSize: "11px",
              fontWeight: "600",
              color: "#888",
              letterSpacing: "1px",
              textTransform: "uppercase",
              marginBottom: "12px"
            }}>
              All Users ({users.length})
            </h3>
            {users.length === 0 ? (
              <div style={{
                padding: "32px",
                textAlign: "center",
                color: "#666",
                fontSize: "14px"
              }}>
                No users found
              </div>
            ) : (
              <div style={{
                display: "grid",
                gap: "1px",
                background: "#222",
                border: "1px solid #222"
              }}>
                {users.map(user => (
                  <div key={user.id} style={{
                    padding: "16px",
                    background: "#0a0a0a",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px"
                  }}>
                    <div style={{ flex: 1, minWidth: "160px" }}>
                      <div style={{ fontSize: "14px", color: "#fff", marginBottom: "4px" }}>
                        {user.username}
                      </div>
                      <div style={{ fontSize: "11px", color: "#666" }}>
                        ID: {user.id}
                      </div>
                      {/* Notify email row */}
                      {editingEmailUserId === user.id ? (
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                          <input
                            type="email"
                            value={editingEmailValue}
                            onChange={e => setEditingEmailValue(e.target.value)}
                            placeholder="user@email.com"
                            autoFocus
                            style={{
                              flex: 1,
                              minWidth: "160px",
                              padding: "6px 10px",
                              fontSize: "12px",
                              border: "1px solid #444",
                              backgroundColor: "#000",
                              color: "#fff",
                              outline: "none",
                              fontFamily: "inherit"
                            }}
                          />
                          <button
                            onClick={() => saveUserNotifyEmail(user.id)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "10px",
                              fontWeight: "600",
                              color: "#000",
                              background: "#4ade80",
                              border: "none",
                              cursor: "pointer",
                              textTransform: "uppercase",
                              letterSpacing: "1px"
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingEmailUserId(null)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "10px",
                              fontWeight: "600",
                              color: "#888",
                              background: "transparent",
                              border: "1px solid #333",
                              cursor: "pointer",
                              textTransform: "uppercase",
                              letterSpacing: "1px"
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", cursor: "pointer" }}
                          onClick={() => { setEditingEmailUserId(user.id); setEditingEmailValue(user.notifyEmail ?? ""); }}
                          title="Click to edit notification email"
                        >
                          <span style={{ fontSize: "11px", color: user.notifyEmail ? "#4ade80" : "#444", fontFamily: "monospace" }}>
                            {user.notifyEmail ? `📧 ${user.notifyEmail}` : "📧 No notify email set"}
                          </span>
                          <span style={{ fontSize: "10px", color: "#555" }}>✎</span>
                        </div>
                      )}
                    </div>
                    {user.isAdmin && (
                      <span style={{
                        padding: "4px 12px",
                        fontSize: "10px",
                        fontWeight: "600",
                        color: "#fbbf24",
                        background: "#fbbf2420",
                        border: "1px solid #fbbf24",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>
                        Admin
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* All Journals Section */}
        <div style={{
          background: "#0a0a0a",
          border: "1px solid #333",
          padding: "32px",
          marginBottom: "24px"
        }}>
          <h2 style={{
            fontSize: "16px",
            fontWeight: "600",
            color: "#fff",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginTop: 0,
            marginBottom: "24px"
          }}>
            All User Journals ({journals.length})
          </h2>
          
          {journals.length === 0 ? (
            <div style={{
              padding: "60px",
              textAlign: "center",
              color: "#666",
              fontSize: "14px"
            }}>
              No journal entries found
            </div>
          ) : (
            <div style={{
              display: "grid",
              gap: "16px"
            }}>
              {journals.map(entry => (
                <div key={entry.id} style={{
                  background: "#000",
                  border: "1px solid #333",
                  padding: "20px"
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "16px",
                    flexWrap: "wrap",
                    gap: "12px"
                  }}>
                    <div>
                      <div style={{
                        fontSize: "11px",
                        color: "#666",
                        fontFamily: "monospace",
                        marginBottom: "4px"
                      }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                      <div style={{
                        fontSize: "11px",
                        color: "#888",
                        marginBottom: "8px"
                      }}>
                        User: {entry.userId}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{
                        padding: "6px 12px",
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "#000",
                        background: getDecisionBadgeColor(entry.decision),
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>
                        {entry.decision}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "16px",
                    marginBottom: "16px"
                  }}>
                    <div>
                      <div style={{
                        fontSize: "10px",
                        color: "#666",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: "4px"
                      }}>
                        Market Sentiment
                      </div>
                      <div style={{ fontSize: "14px", color: "#fff" }}>
                        {getSentimentEmoji(entry.marketSentiment)} {entry.marketSentiment}
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontSize: "10px",
                        color: "#666",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: "4px"
                      }}>
                        Confidence
                      </div>
                      <div style={{ fontSize: "14px", color: "#fff" }}>
                        {entry.confidence}
                      </div>
                    </div>

                    {entry.priceLevel && (
                      <div>
                        <div style={{
                          fontSize: "10px",
                          color: "#666",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                          marginBottom: "4px"
                        }}>
                          Price Level
                        </div>
                        <div style={{ fontSize: "14px", color: "#fff", fontFamily: "monospace" }}>
                          ${entry.priceLevel.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {entry.notes && (
                    <div>
                      <div style={{
                        fontSize: "10px",
                        color: "#666",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: "8px"
                      }}>
                        Notes
                      </div>
                      <div style={{
                        fontSize: "14px",
                        color: "#ccc",
                        lineHeight: "1.6",
                        padding: "12px",
                        background: "#0a0a0a",
                        border: "1px solid #222"
                      }}>
                        {entry.notes}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          background: "#0a0a0a",
          border: "1px solid #333",
          padding: "24px"
        }}>
          <h3 style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "#fff",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginTop: 0,
            marginBottom: "12px"
          }}>
            Preview
          </h3>
          <p style={{
            fontSize: "12px",
            color: "#888",
            marginBottom: "16px"
          }}>
            This is how your message will appear to users:
          </p>
          
          {adminMessage ? (
            <div style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              border: "1px solid #764ba2",
              padding: "16px 24px",
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
          ) : (
            <div style={{
              padding: "32px",
              background: "#000",
              border: "1px solid #222",
              textAlign: "center",
              color: "#666",
              fontSize: "12px"
            }}>
              No message currently set
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
