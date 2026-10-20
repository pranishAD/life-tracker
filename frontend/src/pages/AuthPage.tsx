import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import Button from "../components/Button";
import GradeBadge from "../components/GradeBadge";
import { Input } from "../components/Input";
import clsx from "../lib/clsx";
import { useAuth } from "../context/AuthContext";
import { ApiError, RATE_LIMITED_MESSAGE } from "../api/client";
import type { GradeKey } from "../lib/grade";

const SHOWCASE_GRADES: GradeKey[] = ["s", "a", "b", "c", "d"];

/** Login + register, per design/components.md "01-login" / "01b-register".
 * Both routes render this component; the segmented tabs swap between them. */
export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRegister = location.pathname === "/register";
  const { login, register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // True when the error is "slow down" (HTTP 429), not "your input is wrong".
  // We still show the same error banner, but don't paint the fields red.
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsRateLimited(false);
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Rate limited (Vercel firewall or backend). The client already gives
        // a friendly message; fall back to ours just in case.
        setIsRateLimited(true);
        setError(err.message || RATE_LIMITED_MESSAGE);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[1.1fr_1fr]">
      <section className="hidden md:flex relative overflow-hidden bg-surface-1 border-r border-border p-12 flex-col justify-between">
        <div className="flex items-center gap-2 font-display text-[22px] font-bold" style={{ letterSpacing: "-0.02em" }}>
          <span
            className="w-[22px] h-[22px] rounded-full flex-none"
            style={{ border: "4px solid #ffc93c", borderRightColor: "rgba(255,201,60,.16)", transform: "rotate(-45deg)" }}
          />
          Bihan
        </div>
        <svg
          className="absolute -right-[150px] top-10 w-[460px] h-[460px]"
          viewBox="0 0 520 520"
          aria-hidden="true"
        >
          <circle cx="260" cy="260" r="230" fill="none" stroke="rgba(255,201,60,.16)" strokeWidth="34" />
          <circle
            cx="260" cy="260" r="230" fill="none" stroke="#ffc93c" strokeWidth="34"
            strokeLinecap="round" strokeDasharray="1445.1" strokeDashoffset="101.2"
            transform="rotate(-90 260 260)"
          />
          <circle cx="260" cy="260" r="180" fill="none" stroke="rgba(61,220,132,.16)" strokeWidth="34" />
          <circle
            cx="260" cy="260" r="180" fill="none" stroke="#3ddc84" strokeWidth="34"
            strokeLinecap="round" strokeDasharray="1131.0" strokeDashoffset="214.9"
            transform="rotate(-90 260 260)"
          />
          <circle cx="260" cy="260" r="130" fill="none" stroke="rgba(65,182,255,.16)" strokeWidth="34" />
          <circle
            cx="260" cy="260" r="130" fill="none" stroke="#41b6ff" strokeWidth="34"
            strokeLinecap="round" strokeDasharray="816.8" strokeDashoffset="277.7"
            transform="rotate(-90 260 260)"
          />
        </svg>
        <div className="relative max-w-[440px]">
          <h1 className="font-display font-bold text-[48px] leading-[52px] mb-4" style={{ letterSpacing: "-0.03em" }}>
            Every morning is a fresh shot at your score.
          </h1>
          <p className="text-ink-muted text-[17px] leading-[26px]">
            Track fitness, study, career and anything else. Bihan rates your progress 0-100 so you always
            know if you're locked in or slipping.
          </p>
          <div className="flex gap-2 mt-6">
            {SHOWCASE_GRADES.map((g) => (
              <GradeBadge key={g} grade={g} size="sm" />
            ))}
          </div>
        </div>
      </section>

      <section className="grid place-items-start md:place-items-center p-8 md:p-12">
        <div className="w-full max-w-[400px]">
          <div className="md:hidden flex items-center gap-2 font-display text-[22px] font-bold mb-8" style={{ letterSpacing: "-0.02em" }}>
            <span
              className="w-[22px] h-[22px] rounded-full flex-none"
              style={{ border: "4px solid #ffc93c", borderRightColor: "rgba(255,201,60,.16)", transform: "rotate(-45deg)" }}
            />
            Bihan
          </div>
          <h2 className="font-display text-[28px] leading-[34px] font-bold">
            {isRegister ? "Start your score" : "Welcome back"}
          </h2>
          <p className="text-ink-muted text-body mt-1.5">
            {isRegister ? "Takes 30 seconds. Your first grade shows up after 3 days." : "Sign in to see how you're tracking today."}
          </p>

          <div className="grid grid-cols-2 bg-surface-1 border border-border rounded-md p-1 my-6">
            <Link
              to="/login"
              className={clsx(
                "text-center py-2 rounded-[9px] text-body-sm font-semibold",
                !isRegister ? "bg-surface-3 text-ink" : "text-ink-muted",
              )}
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className={clsx(
                "text-center py-2 rounded-[9px] text-body-sm font-semibold",
                isRegister ? "bg-surface-3 text-ink" : "text-ink-muted",
              )}
            >
              Create account
            </Link>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {error && (
              <div className="flex gap-2 items-center bg-grade-d-dim text-grade-d rounded-md px-3 py-2.5 text-body-sm">
                <AlertCircle className="w-4 h-4 flex-none" />
                {error}
              </div>
            )}

            {isRegister && (
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!isRegister && error && !isRateLimited ? " " : undefined}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error && !isRateLimited ? " " : undefined}
              help={isRegister ? "At least 8 characters." : undefined}
              minLength={isRegister ? 8 : undefined}
              required
            />
            {!isRegister && (
              <a href="#" className="text-body-sm text-ink-muted self-end">
                Forgot password?
              </a>
            )}
            <Button type="submit" className="w-full justify-center mt-2" disabled={isSubmitting}>
              {isSubmitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="text-ink-muted text-body-sm text-center mt-6">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <Link to="/login" className="text-gold font-semibold">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link to="/register" className="text-gold font-semibold">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
