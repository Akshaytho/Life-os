"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useLifeOsAuth } from "./life-os-auth-provider";
import liveStyles from "./live-capture-routing.module.css";
import styles from "./life-os-auth-gate.module.css";

interface LifeOsAuthGateProps {
  area: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function LifeOsAuthGate({ area, title, description, children }: LifeOsAuthGateProps) {
  const { session, authState, authBusy, authMessage, signIn } = useLifeOsAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (authState === "signed_in" && session) return children;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accepted = await signIn(email, password);
    setPassword("");
    if (accepted) setEmail("");
  }

  const stateLabel = authState === "checking"
    ? "CHECKING"
    : authState === "configuration_error"
      ? "NOT CONFIGURED"
      : "SIGNED OUT";

  return (
    <div className={`life-app ${styles.shell}`}>
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · REAL SESSION</div>
        </header>

        <div className={styles.panelWrap}>
          <section className={liveStyles.authPanel} aria-label={`Life OS ${area} sign in`}>
            <div className={liveStyles.authTopline}><span>PRIVATE SESSION · {area.toUpperCase()}</span><span>{stateLabel}</span></div>
            <h2>{title}</h2>
            <p>{description}</p>
            {authState !== "configuration_error" && (
              <form className={liveStyles.authForm} onSubmit={submit}>
                <label>Email<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <button disabled={authBusy || authState === "checking"} type="submit">{authBusy ? "Signing in…" : "Sign in"}</button>
              </form>
            )}
            {authMessage && <p className={liveStyles.authMessage}>{authMessage}</p>}
          </section>
        </div>
      </main>
    </div>
  );
}
