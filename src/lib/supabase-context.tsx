"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Activity, ArrowRight, LockKeyhole, Mail } from "lucide-react";

type SupabaseContextValue = {
  client: SupabaseClient | null;
  session: Session | null;
  loading: boolean;
};

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (!context) throw new Error("useSupabase must be used within SupabaseProvider");
  return context;
}

function AuthenticationScreen({ client }: { client: SupabaseClient }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email")).trim();
    const password = String(values.get("password"));

    const result = isSignUp
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (isSignUp && !result.data.session) {
      setMessage("Account created. Check your email to confirm it, then sign in.");
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="brand auth-brand" href="#top" aria-label="Stride home">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.6} /></span>
          <span>stride<span className="brand-light">camp</span></span>
        </a>
        <div className="auth-intro">
          <span className="auth-lock"><LockKeyhole size={19} /></span>
          <p className="eyebrow">YOUR CAMP WORKSPACE</p>
          <h1 id="auth-title">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p>Sign in to access and manage your camp data.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>Email address<span className="auth-input-wrap"><Mail size={16} /><input autoComplete="email" name="email" placeholder="you@example.com" required type="email" /></span></label>
          <label>Password<span className="auth-input-wrap"><LockKeyhole size={16} /><input autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} name="password" placeholder="At least 8 characters" required type="password" /></span></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="primary-button auth-submit" disabled={busy} type="submit">{busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}<ArrowRight size={16} /></button>
        </form>
        <p className="auth-toggle">{isSignUp ? "Already have an account?" : "New to Stride?"}<button onClick={() => { setIsSignUp(!isSignUp); setError(""); setMessage(""); }} type="button">{isSignUp ? "Sign in" : "Create an account"}</button></p>
        <p className="auth-footnote">Your camp data is private to your account.</p>
      </section>
    </main>
  );
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = useMemo(() => {
    if (!url || !key) return null;
    return createBrowserClient(url, key);
  }, [url, key]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) return;

    let mounted = true;
    const loadingTimeout = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);
    client.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) console.error("Unable to read the Supabase session:", error.message);
        setSession(data.session);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        console.error("Unable to initialize Supabase auth:", error);
        setLoading(false);
      });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, currentSession) => {
      window.clearTimeout(loadingTimeout);
      setSession(currentSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo(() => ({ client, session, loading }), [client, session, loading]);

  if (loading) {
    return <main className="auth-screen"><div className="auth-loading"><Activity size={22} />Loading your workspace…</div></main>;
  }

  return (
    <SupabaseContext.Provider value={value}>
      {client && !session ? <AuthenticationScreen client={client} /> : children}
    </SupabaseContext.Provider>
  );
}
