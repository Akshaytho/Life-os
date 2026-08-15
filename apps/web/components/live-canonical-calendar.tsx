"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { CanonicalCalendarItem, CanonicalCalendarWindow } from "../../../packages/contracts/canonical-calendar";
import { getCanonicalCalendar, LifeOsApiError } from "../lib/life-os-api";
import {
  BrowserAuthConfigurationError,
  getBrowserSupabaseClient,
} from "../lib/supabase-browser";
import liveStyles from "./live-capture-routing.module.css";
import styles from "./live-canonical-calendar.module.css";

function calendarRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 14);
  return { from: from.toISOString(), to: to.toISOString() };
}

function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function safeMessage(error: unknown) {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your session is no longer valid. Sign in again before reading Calendar.";
    if (error.code === "calendar_unavailable") return "Canonical Calendar reads are not available in this private API runtime.";
    if (error.code === "invalid_calendar_window") return "Life OS rejected the Calendar time window instead of guessing around it.";
    if (error.code === "origin_not_allowed") return "This browser origin is not approved for the private Life OS API.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Calendar API.";
  }
  return "Life OS could not load canonical Calendar state. Provider details were kept private.";
}

function groupItems(items: CanonicalCalendarItem[]) {
  const groups = new Map<string, CanonicalCalendarItem[]>();
  for (const item of items) {
    const key = localDateKey(item.startsAt);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.entries());
}

export function LiveCanonicalCalendar() {
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<"checking" | "signed_out" | "signed_in" | "configuration_error">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [calendar, setCalendar] = useState<CanonicalCalendarWindow>();
  const [readBusy, setReadBusy] = useState(false);
  const [readMessage, setReadMessage] = useState("");
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time", []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const client = getBrowserSupabaseClient();
      void client.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) {
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
        if (!nextSession) setCalendar(undefined);
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    } catch (error) {
      if (error instanceof BrowserAuthConfigurationError) {
        setAuthState("configuration_error");
        setAuthMessage("Live browser authentication is not configured for this deployment.");
      } else {
        setAuthState("configuration_error");
        setAuthMessage("Live browser authentication could not be initialized.");
      }
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadCalendar(session.access_token);
  }, [session?.access_token]);

  async function loadCalendar(accessToken?: string) {
    const token = accessToken ?? session?.access_token;
    if (!token) return;

    setReadBusy(true);
    setReadMessage("Reading canonical Calendar state through the private RLS boundary…");
    try {
      const range = calendarRange();
      const result = await getCanonicalCalendar(token, range.from, range.to);
      setCalendar(result);
      setReadMessage(result.items.length === 0
        ? "No canonical Calendar events occupy the next 14 days."
        : `Loaded ${result.items.length} canonical Calendar ${result.items.length === 1 ? "fact" : "facts"}.`);
    } catch (error) {
      setReadMessage(safeMessage(error));
    } finally {
      setReadBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const result = await getBrowserSupabaseClient().auth.signInWithPassword({ email, password });
      setPassword("");
      if (result.error || !result.data.session) {
        setAuthMessage("Sign-in failed. Check the development account credentials and try again.");
        return;
      }
      setSession(result.data.session);
      setAuthState("signed_in");
    } catch {
      setPassword("");
      setAuthMessage("Sign-in could not be completed.");
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
      setCalendar(undefined);
      setAuthState("signed_out");
      setAuthBusy(false);
    }
  }

  const grouped = calendar ? groupItems(calendar.items) : [];

  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · LIVE DEV</div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroTop}><span>CANONICAL CALENDAR</span><span>{timeZone}</span></div>
          <div className={styles.heroGrid}>
            <div><span className="section-kicker">TIME-BOUND FACTS</span><h1>See what Life OS actually committed.</h1></div>
            <p>This view reads durable Calendar facts only. AI observations and proposals stay in Capture/Review; they appear here only after your explicit Apply decision created canonical state.</p>
          </div>
          <nav className={styles.navRow} aria-label="Life OS live development navigation">
            <Link href="/capture">Capture / Review</Link>
            <span>Calendar / canonical read</span>
          </nav>
        </section>

        {authState !== "signed_in" && (
          <section className={liveStyles.authPanel} aria-label="Life OS development sign in">
            <div className={liveStyles.authTopline}><span>PRIVATE SESSION</span><span>{authState === "checking" ? "CHECKING" : "SIGNED OUT"}</span></div>
            <h2>Sign in before Life OS can read your canonical Calendar.</h2>
            <p>The browser holds only a normal Supabase user session. The API verifies it again and PostgreSQL RLS still decides which Calendar rows exist for that user.</p>
            {authState !== "configuration_error" && (
              <form className={liveStyles.authForm} onSubmit={signIn}>
                <label>Email<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <button disabled={authBusy || authState === "checking"} type="submit">{authBusy ? "Signing in…" : "Sign in"}</button>
              </form>
            )}
            {authMessage && <p className={liveStyles.authMessage}>{authMessage}</p>}
          </section>
        )}

        {authState === "signed_in" && session && (
          <>
            <section className={liveStyles.sessionRow} aria-label="Authenticated Calendar session">
              <span className={liveStyles.sessionState}><i />Authenticated user session · canonical read only</span>
              <div className={styles.sessionActions}>
                <button disabled={readBusy} onClick={() => void loadCalendar()} type="button">{readBusy ? "Reading…" : "Refresh"}</button>
                <button disabled={authBusy || readBusy} onClick={signOut} type="button">Sign out</button>
              </div>
            </section>

            {readMessage && <section className={liveStyles.flowStatus} aria-live="polite"><span>CALENDAR READ</span><p>{readMessage}</p></section>}

            <section className={styles.factBoundary}>
              <span>AUTHORITY CLASS</span>
              <strong>FACT</strong>
              <p>Every item below already exists in canonical Calendar state. This surface cannot confirm, apply, reject, edit, or create events.</p>
            </section>

            <section className={styles.calendarSurface} aria-label="Canonical Calendar facts">
              <div className={styles.windowHeader}>
                <div><span>NEXT 14 DAYS</span><h2>Committed time</h2></div>
                <p>{calendar ? `${new Date(calendar.from).toLocaleDateString()} → ${new Date(calendar.to).toLocaleDateString()}` : "Loading bounded Calendar window…"}</p>
              </div>

              {calendar && calendar.items.length === 0 && (
                <div className={styles.emptyState}>No canonical Calendar events occupy this window.</div>
              )}

              <div className={styles.dayStack}>
                {grouped.map(([date, items]) => (
                  <section className={styles.dayGroup} key={date}>
                    <div className={styles.dayHeading}><span>{dateLabel(items[0].startsAt)}</span><strong>{items.length}</strong></div>
                    <div className={styles.eventStack}>
                      {items.map((item) => (
                        <article className={styles.eventCard} key={item.id} data-category={item.category}>
                          <div className={styles.eventTime}><strong>{timeLabel(item.startsAt)}</strong><span>→ {timeLabel(item.endsAt)}</span></div>
                          <div className={styles.eventMain}><span>FACT · {item.category}</span><h3>{item.title}</h3><p>{item.commitment} commitment</p></div>
                          <div className={styles.eventMeta}><span>Committed</span><strong>{new Date(item.committedAt).toLocaleString()}</strong></div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className={styles.footer}>
          <span>SUPABASE SESSION · PRIVATE API · POSTGRESQL RLS</span>
          <span>READ ONLY · CANONICAL FACTS</span>
        </footer>
      </main>
    </div>
  );
}
