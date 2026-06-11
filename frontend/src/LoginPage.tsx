import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      <div style={{
        maxWidth: "400px",
        width: "100%"
      }}>
        <h1 style={{
          color: "#ffffff",
          fontSize: "32px",
          fontWeight: "300",
          letterSpacing: "2px",
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: "40px"
        }}>
          Login
        </h1>

        <form onSubmit={handleSubmit} style={{
          background: "#0a0a0a",
          border: "1px solid #333",
          padding: "32px",
          marginBottom: "24px"
        }}>
          {error && (
            <div style={{
              padding: "12px",
              background: "#ff000020",
              border: "1px solid #ff0000",
              color: "#ff6b6b",
              marginBottom: "24px",
              fontSize: "14px",
              borderRadius: "4px"
            }}>
              {error}
            </div>
          )}

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
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "16px",
                border: "1px solid #333",
                backgroundColor: "#000",
                color: "#fff",
                outline: "none",
                boxSizing: "border-box"
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
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "16px",
                border: "1px solid #333",
                backgroundColor: "#000",
                color: "#fff",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "12px",
              fontWeight: "600",
              color: loading ? "#333" : "#000",
              background: loading ? "#111" : "#fff",
              border: "1px solid #333",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              textTransform: "uppercase",
              letterSpacing: "1px"
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div style={{
          textAlign: "center",
          fontSize: "14px",
          color: "#888"
        }}>
          Don't have an account?{" "}
          <Link
            to="/signup"
            style={{
              color: "#667eea",
              textDecoration: "none"
            }}
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
