import { useState } from "react";
import { requestSignInEmail } from "../lib/supabase-service";
import { useAuthStore } from "../store/useAuthStore";

export function LoginScreen() {
  const { signIn } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState<"password" | "email" | null>(null);
  const loading = pending !== null;

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand large"><span className="brand-mark">b</span><span className="brand-name">bookkit</span></div>
        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">Sign in to continue writing.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Email
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              autoFocus
              required
            />
          </label>
          <label className="login-label">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
            />
          </label>
          <button type="submit" className="login-button" disabled={loading}>
            {pending === "password" ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="login-divider"><span>or</span></div>
        <div className="login-alternative">
        <button type="button" className="login-button login-button-secondary" disabled={loading || !email.includes('@')} onClick={async()=>{
          setPending('email');setError('');
          try{await requestSignInEmail(email);setSent(true);}catch(e){setError((e as Error).message);}finally{setPending(null);}
        }}>{pending === "email" ? "Sending link…" : "Email me a sign-in link"}</button>
        <p className="login-hint">Forgot your password? Enter your email above and use a sign-in link.</p>
        </div>
        {error && <p className="login-error" role="alert">{error}</p>}
        {sent && <p className="login-sent" role="status">If <strong>{email}</strong> has a Bookkit account, a sign-in link is on its way. Forgot your password? Sign in with the link, then choose <em>Set password</em> in the account menu.</p>}

      </div>
    </div>
  );
}
