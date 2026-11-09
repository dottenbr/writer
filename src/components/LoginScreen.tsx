import { useEffect, useRef, useState } from "react";
import { requestSignInEmail } from "../lib/supabase-service";
import { useAuthStore } from "../store/useAuthStore";
import { navigatePublic } from "../lib/public-routes";

const RESEND_SECONDS = 60;

function linkFailure(): { email: string; error: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem("bookkit-link-failed") ?? "null");
    sessionStorage.removeItem("bookkit-link-failed");
    return value;
  } catch { return null; }
}

export function LoginScreen() {
  const { signIn, signInWithCode } = useAuthStore();
  const [failed] = useState(linkFailure);
  const [email, setEmail] = useState(failed?.email ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(failed ? `The sign-in link didn’t work: ${failed.error}` : "");
  const [step, setStep] = useState<"password" | "code">(failed ? "code" : "password");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState<"password" | "email" | "code" | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const loading = pending !== null;
  const [note] = useState(() => {
    try {
      const n = JSON.parse(localStorage.getItem("bookkit-auth-note") ?? "null");
      return n && Date.now() - Date.parse(n.at) < 86400000 ? n as { reason: string; at: string } : null;
    } catch { return null; }
  });
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => { if (step === "code") codeInput.current?.focus(); }, [step, sent]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending("password");
    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err?.message || "Sign in failed");
    } finally {
      setPending(null);
    }
  };

  const sendCode = async () => {
    setPending("email"); setError("");
    try {
      await requestSignInEmail(email);
      setSent(true); setStep("code"); setCode(""); setCooldown(RESEND_SECONDS);
    } catch (e) { setError((e as Error).message); } finally { setPending(null); }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, "").length !== 6) return;
    setPending("code"); setError("");
    try { await signInWithCode(email, code); }
    catch (err) { setError((err as Error).message); setPending(null); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card-top">
          <a
            href="/marketing"
            className="brand large"
            onClick={(e) => {
              e.preventDefault();
              navigatePublic("/marketing");
            }}
          >
            <span className="brand-mark">b</span>
            <span className="brand-name">bookkit</span>
          </a>
          <div className="login-top-links">
            <a
              href="/marketing"
              className="login-link"
              onClick={(e) => {
                e.preventDefault();
                navigatePublic("/marketing");
              }}
            >
              Overview
            </a>
            <a
              href="/docs"
              className="login-link"
              onClick={(e) => {
                e.preventDefault();
                navigatePublic("/docs");
              }}
            >
              Docs
            </a>
          </div>
        </div>

        {step === "password" ? (
          <>
            <h1 className="login-title">Welcome back</h1>
            <p className="login-subtitle">Sign in to continue writing.</p>
            <form onSubmit={submitPassword} className="login-form">
              <label className="login-label">
                Email
                <input type="email" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="login-input" autoFocus required />
              </label>
              <label className="login-label">
                Password
                <input type="password" name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="login-input" required />
              </label>
              <button type="submit" className="login-button" disabled={loading}>
                {pending === "password" ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="login-divider"><span>or</span></div>
            <div className="login-alternative">
              <button type="button" className="login-button login-button-secondary" disabled={loading || !validEmail} onClick={() => void sendCode()}>
                {pending === "email" ? "Sending code…" : "Email me a sign-in code"}
              </button>
              <p className="login-hint">
                {validEmail ? "No password needed: we’ll email you a one-time code." : "Enter your email above to get a one-time code instead."}{" "}
                <button type="button" className="login-link" disabled={!validEmail} onClick={() => { setStep("code"); setSent(false); setError(""); }}>I have a code</button>
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="login-title">{sent ? "Check your email" : "Enter your code"}</h1>
            <p className="login-subtitle">
              {sent
                ? <>If <strong>{email.trim()}</strong> has a Bookkit account, a 6-digit code is on its way. It expires in 15 minutes.</>
                : <>Enter the code from your Bookkit email for <strong>{email.trim()}</strong>.</>}
            </p>
            <form onSubmit={submitCode} className="login-form">
              <label className="login-label">
                Code
                <input
                  ref={codeInput}
                  className="login-input login-code"
                  name="one-time-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={7}
                  placeholder="123 456"
                  value={code}
                  onChange={e => { const d = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(d.length > 3 ? d.slice(0, 3) + " " + d.slice(3) : d); }}
                  required
                />
              </label>
              <button type="submit" className="login-button" disabled={loading || code.replace(/\D/g, "").length !== 6}>
                {pending === "code" ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="login-code-actions">
              <button type="button" className="login-link" disabled={loading || cooldown > 0} onClick={() => void sendCode()}>
                {pending === "email" ? "Sending…" : cooldown > 0 ? `Send a new code in ${cooldown}s` : sent ? "Send a new code" : "Email me a code"}
              </button>
              <button type="button" className="login-link" onClick={() => { setStep("password"); setError(""); }}>Use my password</button>
            </div>
            <p className="login-hint">Not in your inbox? Check spam and mark it “Not spam” so the next one arrives normally.</p>
          </>
        )}
        {error && <p className="login-error" role="alert">{error}</p>}
        {note && step === "password" && <p className="login-note">Signed out {new Date(note.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: {note.reason}</p>}
        <div className="login-signup-cta">
          <span>New to Bookkit?</span>
          <a
            href="/signup"
            className="login-link"
            onClick={(e) => {
              e.preventDefault();
              navigatePublic("/signup");
            }}
          >
            Claim your free library &amp; shelves ($0/mo) →
          </a>
        </div>
      </div>
    </div>
  );
}
