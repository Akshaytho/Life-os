"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CanonicalCalendarItem, CanonicalCalendarWindow } from "../../../packages/contracts/canonical-calendar";
import { getCanonicalCalendar, LifeOsApiError } from "../lib/life-os-api";
import liveStyles from "./live-capture-routing.module.css";
import { useLifeOsAuth } from "./life-os-auth-provider";
import { ManualCalendarCommitmentForm } from "./manual-calendar-commitment";
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
  const { session, authBusy, signOut } = useLifeOsAuth();
  const [calendar, setCalendar] = useState<CanonicalCalendarWindow>();
  const [readBusy, setReadBusy] = useState(false);
  const [readMessage, setReadMessage] = useState("");
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time", []);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadCalendar(session.access_token);
  }, [session?.access_token]);

  async function loadCalendar(accessToken?: string) {
    const token = accessToken ?? session?.access_token;
    if (!token) return;

    setReadBusy(true);
    setReadMessage("Reading canonical Calendar state…");
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

  const grouped = calendar ? groupItems(calendar.items) : [];

  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · CALENDAR</div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroTop}><span>CANONICAL CALENDAR</span><span>{timeZone}</span></div>
          <div className={styles.heroGrid}>
            <div><span className="section-kicker">TIME-BOUND REALITY</span><h1>Commit time. See what is real.</h1></div>
            <p>Manual commitments work without AI. You choose exact details, review once, then the confirmed time block becomes a Calendar FACT.</p>
          </div>
          <nav className={styles.navRow} aria-label="Life OS Calendar navigation">
            <Link href="/">Today</Link>
            <Link href="/capture">Brain Dump</Link>
            <span>Calendar</span>
          </nav>
        </section>

        {session && (
          <>
            <ManualCalendarCommitmentForm
              accessToken={session.access_token}
              onCommitted={() => loadCalendar(session.access_token)}
            />

            <section className={styles.factBoundary}>
              <span>CALENDAR AUTHORITY</span>
              <strong>FACT</strong>
              <p>Only the final “Commit to Calendar” action creates a fact. Drafts and reviews do not write, and AI is not involved in manual entry.</p>
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

            <section className={liveStyles.sessionRow} aria-label="Authenticated Calendar session">
              <span className={liveStyles.sessionState}><i />Authenticated user session · explicit Calendar writes</span>
              <div className={styles.sessionActions}>
                <button disabled={readBusy} onClick={() => void loadCalendar()} type="button">{readBusy ? "Reading…" : "Refresh"}</button>
                <button disabled={authBusy || readBusy} onClick={() => void signOut()} type="button">Sign out</button>
              </div>
            </section>

            {readMessage && <section className={liveStyles.flowStatus} aria-live="polite"><span>CALENDAR STATE</span><p>{readMessage}</p></section>}
          </>
        )}

        <footer className={styles.footer}>
          <span>SUPABASE SESSION · PRIVATE API · POSTGRESQL RLS</span>
          <span>MANUAL CONFIRMATION · CANONICAL FACTS</span>
        </footer>
      </main>
    </div>
  );
}