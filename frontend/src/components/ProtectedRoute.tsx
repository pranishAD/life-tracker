import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Wraps routes that require a logged-in user. Redirects to /login when
 * logged out, and holds off rendering while we're still checking a stored
 * token against /auth/me (`status === "loading"`). */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <div className="min-h-screen bg-bg" />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
