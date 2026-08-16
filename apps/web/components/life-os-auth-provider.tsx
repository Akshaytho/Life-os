"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  BrowserAuthConfigurationError,
  getBrowserSupabaseClient,
} from "../lib/supabase-browser";

export type LifeOsAuthState = "checking" | "signed_out" | "signed_in" | "configuration_error";

interface LifeOsAuthContextValue {
  session: Session | null;
  authState: LifeOsAuthState;
  authBusy: boolean;
  authMessage: string;
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
}

const LifeOsAuthContext = createContext<LifeOsAuthContextValue | undefined>(undefined);

export function LifeOsAuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<LifeOsAuthState>("checking");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const client = getBrowserSupabaseClient();
      void client.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSession(null);
          setAuthState("signed_out");
          setAuthMessage("Life OS could not restore the browser session.");
          return;
        }
        setSession(data.session);
        setAuthState(data.session ? "signed_in" : "signed_out");
      });

      const listener = client.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setAuthState(nextSession ? "signed_in" : "signed_out");
        setAuthMessage("");
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    } catch (error) {
      setSession(null);
      setAuthState("configuration_error");
      setAuthMessage(error instanceof BrowserAuthConfigurationError
        ? "Live browser authentication is not configured for this deployment."
        : "Live browser authentication could not be initialized.");
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function signIn(email: string, password: string) {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const result = await getBrowserSupabaseClient().auth.signInWithPassword({ email, password });
      if (result.error || !result.data.session) {
        setAuthMessage("Sign-in failed. Check the development account credentials and try again.");
        return false;
      }
      setSession(result.data.session);
      setAuthState("signed_in");
      return true;
    } catch {
      setAuthMessage("Sign-in could not be completed.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    try {
      await getBrowserSupabaseClient().auth.signOut({ scope: "local" });
    } finally {
      setSession(null);
      setAuthState("signed_out");
      setAuthMessage("");
      setAuthBusy(false);
    }
  }

  const value = useMemo<LifeOsAuthContextValue>(() => ({
    session,
    authState,
    authBusy,
    authMessage,
    signIn,
    signOut,
  }), [session, authState, authBusy, authMessage]);

  return <LifeOsAuthContext.Provider value={value}>{children}</LifeOsAuthContext.Provider>;
}

export function useLifeOsAuth() {
  const value = useContext(LifeOsAuthContext);
  if (!value) throw new Error("useLifeOsAuth must be used within LifeOsAuthProvider");
  return value;
}
