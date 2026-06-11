import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await register(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Signup failed");
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
          Sign Up
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
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div style={{
          textAlign: "center",
          fontSize: "14px",
          color: "#888"
        }}>
          Already have an account?{" "}
          <Link
            to="/login"
            style={{
              color: "#667eea",
              textDecoration: "none"
            }}
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
