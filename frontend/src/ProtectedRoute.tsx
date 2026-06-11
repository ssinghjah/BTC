import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

interface ProtectedRouteProps {
  children: React.ReactElement;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}>
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
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !user.isAdmin) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}>
        <div style={{
          maxWidth: "600px",
          padding: "40px",
          textAlign: "center"
        }}>
          <h1 style={{
            color: "#ffffff",
            fontSize: "32px",
            fontWeight: "300",
            letterSpacing: "2px",
            textTransform: "uppercase",
            marginBottom: "20px"
          }}>
            Access Denied
          </h1>
          <p style={{
            color: "#888",
            fontSize: "16px",
            marginBottom: "30px"
          }}>
            You need admin privileges to access this page.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              fontSize: "11px",
              fontWeight: "600",
              color: "#000",
              background: "#fff",
              border: "1px solid #fff",
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "1px"
            }}
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  return children;
}
