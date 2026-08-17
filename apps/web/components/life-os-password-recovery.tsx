"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import liveStyles from "./live-capture-routing.module.css";
import styles from "./life-os-auth-gate.module.css";
import { useLifeOsAuth } from "./life-os-auth-provider";

export function LifeOsPasswordRecovery() {
  const {
    session,
    authState,
    authBusy,
    authMessage,
    recoveryMode,
    requestPasswordReset,
    updateRecoveredPassword,
  } = useLifeOsAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestPasswordReset(email);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accepted = await updateRecoveredPassword(password, confirmation);
    setPassword("");
    setConfirmation("");
    if (accepted) setComplete(true);
  }

  const readyToUpdate = recoveryMode && Boolean(session);
  const stateLabel = authState === "checking"
    ? "CHECKING"
    : authState === "configuration_error"
      ? "NOT CONFIGURED"
      : readyToUpdate
        ? "RECOVERY VERIFIED"
        : "RECOVERY REQUEST";

  return (
    <div className={`life-app ${styles.shell}`}>
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · ACCOUNT RECOVERY</div>
        </header>

        <div className={styles.panelWrap}>
          <section className={liveStyles.authPanel} aria-label="Life OS password recovery">
            <div className={liveStyles.authTopline}><span>SUPABASE AUTH · PASSWORD RECOVERY</span><span>{stateLabel}</span></div>

            {complete ? (
              <>
                <h2>Password updated.</h2>
                <p>Your current private session remains signed in. Continue into Life OS or sign out from any live screen when you are finished.</p>
                <div className={liveStyles.retryRow}><Link href="/today">Continue to Today</Link></div>
              </>
            ) : readyToUpdate ? (
              <>
                <h2>Set a new password.</h2>
                <p>The recovery link established a temporary authenticated recovery session. Life OS sends only the new password to Supabase Auth; no admin credential is present in this browser.</p>
                <form className={liveStyles.authForm} onSubmit={updatePassword}>
                  <label>New password<input autoComplete="new-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                  <label>Confirm password<input autoComplete="new-password" type="password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
                  <button disabled={authBusy} type="submit">{authBusy ? "Updating…" : "Update password"}</button>
                </form>
              </>
            ) : (
              <>
                <h2>Recover your private session.</h2>
                <p>Enter the email used for Life OS. If recovery mail can be delivered for that address, Supabase will send a link back to this exact Life OS recovery page.</p>
                {authState !== "configuration_error" && (
                  <form className={liveStyles.authForm} onSubmit={requestReset}>
                    <label>Email<input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                    <button disabled={authBusy || authState === "checking"} type="submit">{authBusy ? "Requesting…" : "Send recovery link"}</button>
                  </form>
                )}
                <div className={liveStyles.retryRow}><Link href="/today">Back to sign in</Link></div>
              </>
            )}

            {authMessage && <p className={liveStyles.authMessage} aria-live="polite">{authMessage}</p>}
          </section>
        </div>
      </main>
    </div>
  );
}
