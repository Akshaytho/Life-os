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
import styles from "./live-today.module.css";

function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(value);
}

function durationLabel(milliseconds: number) {
  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function occupiedMilliseconds(items: CanonicalCalendarItem[], from: string, to: string) {
  const lower = Date.parse(from);
  const upper = Date.parse(to);
  const intervals = items
    .map((item) => [Math.max(lower, Date.parse(item.startsAt)), Math.min(upper, Date.parse(item.endsAt))] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let currentStart: number | undefined;
  let currentEnd: number | undefined;
  for (const [start, end] of intervals) {
    if (currentStart === undefined || currentEnd === undefined) {
      currentStart = start;
      currentEnd = end;
      continue;
    }
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = start;
    currentEnd = end;
  }
  if (currentStart !== undefined && currentEnd !== undefined) total += currentEnd - currentStart;
  return total;
}

function safeMessage(error: unknown) {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your session is no longer valid. Sign in again before reading Today.";
    if (error.code === "calendar_unavailable") return "Canonical Calendar reads are not available in this private API runtime.";
    if (error.code === "origin_not_allowed") return "This browser origin is not approved for the private Life OS API.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Today read boundary.";
    if (error.code === "invalid_calendar_window") return "Life OS refused the Today time window instead of showing incomplete state.";
  }
  return "Life OS could not load Today. Provider details were kept private.";
}

export function LiveToday() {
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<"checking" | "signed_out" | "signed_in" | "configuration_error">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [calendar, setCalendar] = useState<CanonicalCalendarWindow>();
  const [readBusy, setReadBusy] = useState(false);
  const [readMessage, setReadMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time", []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    void loadToday(session.access_token);
  }, [session?.access_token]);

  async function loadToday(accessToken?: string) {
    const token = accessToken ?? session?.access_token;
    if (!token) return;

    setReadBusy(true);
    setReadMessage("Reading today's canonical Calendar facts…");
    try {
      const range = todayRange();
      const result = await getCanonicalCalendar(token, range.from, range.to);
      setCalendar(result);
      setNow(new Date());
      setReadMessage(result.items.length === 0
        ? "Today has no canonical Calendar events yet."
        : `Today contains ${result.items.length} canonical Calendar ${result.items.length === 1 ? "fact" : "facts"}.`);
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

  const nowMs = now.getTime();
  const items = calendar?.items ?? [];
  const current = items.find((item) => Date.parse(item.startsAt) <= nowMs && Date.parse(item.endsAt) > nowMs);
  const next = items.find((item) => Date.parse(item.startsAt) > nowMs);
  const completed = items.filter((item) => Date.parse(item.endsAt) <= nowMs).length;
  const upcoming = items.filter((item) => Date.parse(item.startsAt) > nowMs).length;
  const occupied = calendar ? occupiedMilliseconds(items, calendar.from, calendar.to) : 0;

  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · LIVE DEV</div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroTop}><span>TODAY / CANONICAL READ</span><span>{timeZone}</span></div>
          <div className={styles.heroGrid}>
            <div>
              <span className="section-kicker">CURRENT REALITY</span>
              <h1>{dateLabel(now)}</h1>
            </div>
            <div className={styles.clockBlock}><span>LOCAL NOW</span><strong>{timeLabel(now.toISOString())}</strong></div>
          </div>
          <p className={styles.orientation}>Today V1 shows only durable Calendar facts. Journey, Memory, direction, focus, and AI guidance stay absent until their own canonical read contracts exist.</p>
          <nav className={styles.navRow} aria-label="Live Life OS navigation">
            <span>Today / canonical</span>
            <Link href="/calendar">Calendar</Link>
            <Link href="/capture">Capture / Review</Link>
          </nav>
        </section>

        {authState !== "signed_in" && (
          <section className={liveStyles.authPanel} aria-label="Life OS development sign in">
            <div className={liveStyles.authTopline}><span>PRIVATE SESSION</span><span>{authState === "checking" ? "CHECKING" : "SIGNED OUT"}</span></div>
            <h2>Sign in before Life OS can read your Today state.</h2>
            <p>Today is derived from your canonical Calendar only after the API verifies your normal Supabase user session and PostgreSQL RLS applies your private scope.</p>
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
            <section className={liveStyles.sessionRow} aria-label="Authenticated Today session">
              <span className={liveStyles.sessionState}><i />Authenticated user session · read only</span>
              <div className={styles.sessionActions}>
                <button disabled={readBusy} onClick={() => void loadToday()} type="button">{readBusy ? "Reading…" : "Refresh"}</button>
                <button disabled={authBusy || readBusy} onClick={signOut} type="button">Sign out</button>
              </div>
            </section>

            {readMessage && <section className={liveStyles.flowStatus} aria-live="polite"><span>TODAY READ</span><p>{readMessage}</p></section>}

            <section className={styles.nowSection} aria-label="Current and next canonical Calendar state">
              <article className={styles.primarySignal} data-state={current ? "current" : "open"}>
                <span>{current ? "HAPPENING NOW" : "NO CURRENT CANONICAL EVENT"}</span>
                <strong>{current?.title ?? "Calendar is open at this moment."}</strong>
                <p>{current ? `${timeLabel(current.startsAt)} → ${timeLabel(current.endsAt)} · ${current.category} · ${current.commitment}` : "Life OS will not invent an activity for this gap."}</p>
              </article>
              <article className={styles.nextSignal}>
                <span>NEXT CANONICAL EVENT</span>
                <strong>{next?.title ?? "Nothing else is committed today."}</strong>
                <p>{next ? `${timeLabel(next.startsAt)} → ${timeLabel(next.endsAt)} · ${next.category} · ${next.commitment}` : "No suggestion has been promoted into Calendar fact for the rest of this day."}</p>
              </article>
            </section>

            <section className={styles.readout} aria-label="Today canonical Calendar summary">
              <div><strong>{items.length}</strong><span>canonical events</span></div>
              <div><strong>{durationLabel(occupied)}</strong><span>occupied by Calendar facts</span></div>
              <div><strong>{completed}</strong><span>completed by clock</span></div>
              <div><strong>{upcoming}</strong><span>still ahead</span></div>
            </section>

            <section className={styles.timeline} aria-label="Today's canonical Calendar events">
              <div className={styles.sectionHeading}>
                <div><span>FACTS / CHRONOLOGICAL</span><h2>The shape of today</h2></div>
                <p>Overlapping events are counted once in the occupied-time readout. Every card below is already canonical.</p>
              </div>

              {calendar && items.length === 0 && <div className={styles.emptyState}>No canonical Calendar events exist for today.</div>}

              <div className={styles.eventStack}>
                {items.map((item) => {
                  const state = Date.parse(item.endsAt) <= nowMs ? "past" : Date.parse(item.startsAt) <= nowMs ? "current" : "upcoming";
                  return (
                    <article className={styles.eventCard} data-state={state} key={item.id}>
                      <div className={styles.timeRail}><strong>{timeLabel(item.startsAt)}</strong><span>{timeLabel(item.endsAt)}</span></div>
                      <div className={styles.eventMain}><span>FACT · {item.category}</span><h3>{item.title}</h3><p>{item.commitment} commitment</p></div>
                      <div className={styles.eventState}><span>{state}</span><small>committed {new Date(item.committedAt).toLocaleString()}</small></div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className={styles.missingDomains}>
              <span>INTENTIONALLY NOT SHOWN</span>
              <strong>No fake direction, focus, Journey progress, Memory, or AI guidance.</strong>
              <p>Those areas need their own persisted read models before the live Today page can claim them as current state. The sample prototype still exists when live browser configuration is absent.</p>
            </aside>
          </>
        )}

        <footer className={styles.footer}>
          <span>SUPABASE SESSION · CANONICAL CALENDAR · POSTGRESQL RLS</span>
          <span>READ ONLY · NO HIDDEN WRITES</span>
        </footer>
      </main>
    </div>
  );
}
