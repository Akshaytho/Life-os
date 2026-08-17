"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  prepareRecoveredPassword,
  prepareRecoveryEmail,
  prepareSignInCredentials,
} from "../lib/auth-input";
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
  recoveryMode: boolean;
  signIn(email: string, password: string): Promise<boolean>;
  requestPasswordReset(email: string): Promise<boolean>;
  updateRecoveredPassword(password: string, confirmation: string): Promise<boolean>;
  signOut(): Promise<void>;
}

const LifeOsAuthContext = createContext<LifeOsAuthContextValue | undefined>(undefined);

export function LifeOsAuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<LifeOsAuthState>("checking");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

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

      const listener = client.auth.onAuthStateChange((event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setAuthState(nextSession ? "signed_in" : "signed_out");
        if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
        if (event === "SIGNED_OUT") setRecoveryMode(false);
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
    const prepared = prepareSignInCredentials(email, password);
    if (!prepared.ok) {
      setAuthMessage(prepared.message);
      return false;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const result = await getBrowserSupabaseClient().auth.signInWithPassword({
        email: prepared.email,
        password: prepared.password,
      });
      if (result.error || !result.data.session) {
        setSession(null);
        setAuthState("signed_out");
        setAuthMessage("Sign-in failed. Check your email and password and try again.");
        return false;
      }
      setRecoveryMode(false);
      setSession(result.data.session);
      setAuthState("signed_in");
      return true;
    } catch {
      setSession(null);
      setAuthState("signed_out");
      setAuthMessage("Sign-in could not be completed. Check your connection and try again.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestPasswordReset(email: string) {
    const prepared = prepareRecoveryEmail(email);
    if (!prepared.ok) {
      setAuthMessage(prepared.message);
      return false;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const redirectTo = `${window.location.origin}/auth/recovery`;
      const result = await getBrowserSupabaseClient().auth.resetPasswordForEmail(prepared.email, { redirectTo });
      if (result.error) {
        setAuthMessage("Recovery email could not be sent. Try again later.");
        return false;
      }
      setAuthMessage("If this address can receive a Life OS recovery email, use the link in that message to continue.");
      return true;
    } catch {
      setAuthMessage("Recovery email could not be sent. Check your connection and try again.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  }

  async function updateRecoveredPassword(password: string, confirmation: string) {
    if (!recoveryMode || !session) {
      setAuthMessage("Open the current Life OS recovery link from your email before setting a new password.");
      return false;
    }

    const prepared = prepareRecoveredPassword(password, confirmation);
    if (!prepared.ok) {
      setAuthMessage(prepared.message);
      return false;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const result = await getBrowserSupabaseClient().auth.updateUser({ password: prepared.password });
      if (result.error) {
        setAuthMessage("The new password was not accepted. Use a password that meets the account requirements and try again.");
        return false;
      }
      setRecoveryMode(false);
      setAuthMessage("Password updated. Your current private session remains signed in.");
      return true;
    } catch {
      setAuthMessage("Password update could not be completed. Check your connection and try again.");
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
      setRecoveryMode(false);
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
    recoveryMode,
    signIn,
    requestPasswordReset,
    updateRecoveredPassword,
    signOut,
  }), [session, authState, authBusy, authMessage, recoveryMode]);

  return <LifeOsAuthContext.Provider value={value}>{children}</LifeOsAuthContext.Provider>;
}

export function useLifeOsAuth() {
  const value = useContext(LifeOsAuthContext);
  if (!value) throw new Error("useLifeOsAuth must be used within LifeOsAuthProvider");
  return value;
}
