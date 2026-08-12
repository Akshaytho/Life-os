"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import type { CalendarCategory, CalendarEvent, CalendarLens, CalendarViewModel, RoutedIntent } from "../lib/calendar-types";
import type { SourceRef, TrustClass } from "../lib/types";
import styles from "./calendar-dashboard.module.css";

type IconName = "today" | "journey" | "calendar" | "memory" | "you" | "plus" | "spark" | "arrow" | "clock" | "check";
type NavItem = { label: string; icon: IconName; href?: string; active: boolean };

const navItems: NavItem[] = [
  { label: "Today", icon: "today", href: "/", active: false },
  { label: "Journey", icon: "journey", href: "/journey", active: false },
  { label: "Calendar", icon: "calendar", href: "/calendar", active: true },
  { label: "Memory", icon: "memory", active: false },
  { label: "You", icon: "you", active: false },
];

const lenses: { id: CalendarLens; label: string; question: string }[] = [
  { id: "DAY", label: "Day", question: "capacity" },
  { id: "WEEK", label: "Week", question: "rhythm" },
  { id: "MONTH", label: "Month", question: "texture" },
  { id: "YEAR", label: "Year", question: "seasons" },
];

const trustLabels: Record<TrustClass, string> = {
  FACT: "Fact",
  REFLECTION: "Reflection",
  OBSERVATION: "Observation",
  SUGGESTION: "Suggestion",
  DECISION: "Decision",
};

const categoryShort: Record<CalendarCategory, string> = {
  Work: "WRK",
  Creator: "CRT",
  Learning: "LRN",
  Health: "HLT",
  Family: "FAM",
  Friends: "FRD",
  Travel: "TRV",
  Personal: "PER",
  Rest: "RST",
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "today") return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" /></svg>;
  if (name === "journey") return <svg {...common}><path d="M4 18c4-8 7-11 16-13" /><circle cx="5" cy="18" r="2" /><path d="m16 4 4 1-1 4" /></svg>;
  if (name === "calendar") return <svg {...common}><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" /><path d="M7 2v4M17 2v4M3 9h18" /></svg>;
  if (name === "memory") return <svg {...common}><path d="M6 3h10a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z" /><path d="M8 21a3 3 0 0 1 0-6h11M9 8h6M9 11h4" /></svg>;
  if (name === "you") return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-4.1 3-6.1 6.5-6.1s5.7 2 6.5 6.1" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3c.7 4.3 2.4 6 6.5 6.5C14.4 10 12.7 11.7 12 16c-.7-4.3-2.4-6-6.5-6.5C9.6 9 11.3 7.3 12 3Z" /></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

function TrustTag({ kind }: { kind: TrustClass }) {
  return <span className={`trust-tag trust-${kind.toLowerCase()}`}>{trustLabels[kind]}</span>;
}

function Provenance({ source }: { source: SourceRef }) {
  return (
    <details className={`source-disclosure ${styles.source}`}>
      <summary><TrustTag kind={source.trustClass} /><span className="source-word">source</span></summary>
      <div className="source-panel"><strong>{source.label}</strong><span>{source.detail}</span><span>{source.recordedAt}</span></div>
    </details>
  );
}

function NavButton({ item }: { item: NavItem }) {
  const contents = <><Icon name={item.icon} size={20} /><span>{item.label}</span></>;
  if (item.href) return <Link href={item.href} className={`nav-button ${styles.navLink} ${item.active ? "active" : ""}`} aria-current={item.active ? "page" : undefined}>{contents}</Link>;
  return <button className="nav-button" disabled>{contents}</button>;
}

function AppNavigation() {
  return (
    <>
      <aside className="desktop-nav" aria-label="Primary navigation">
        <div className="desktop-brand"><span>L/O</span><small>PRIVATE</small></div>
        <div className="desktop-links">{navItems.map((item) => <NavButton item={item} key={item.label} />)}</div>
        <button className="desktop-capture" disabled><Icon name="plus" size={22} /><span>Capture</span></button>
      </aside>
      <nav className="bottom-nav" aria-label="Primary navigation">{navItems.map((item) => <NavButton item={item} key={item.label} />)}</nav>
      <button className="floating-capture" disabled aria-label="Capture"><Icon name="plus" size={25} /><span>Capture</span></button>
    </>
  );
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

const DAY_START = 6 * 60;
const DAY_END = 23 * 60;
const DAY_SPAN = DAY_END - DAY_START;

function EventBlock({ event }: { event: CalendarEvent }) {
  if (!event.startTime || !event.endTime) return null;
  const start = toMinutes(event.startTime);
  const end = toMinutes(event.endTime);
  const top = Math.max(0, ((start - DAY_START) / DAY_SPAN) * 100);
  const height = Math.max(3.5, ((end - start) / DAY_SPAN) * 100);
  const style = { top: `${top}%`, height: `${height}%` } as CSSProperties;

  return (
    <details className={styles.dayEvent} data-category={event.category} data-status={event.status} style={style}>
      <summary>
        <span className={styles.eventTime}>{event.startTime}</span>
        <span className={styles.eventMain}><strong>{event.title}</strong><small>{event.category} · {event.commitment.toLowerCase()}</small></span>
      </summary>
      <div className={styles.eventDetail}>
        <p>{event.detail}</p>
        {event.relatedLabel && <span className={styles.related}>{event.relatedLabel}</span>}
        <Provenance source={event.source} />
      </div>
    </details>
  );
}

function DayLens({ model }: { model: CalendarViewModel }) {
  const todayEvents = model.events.filter((event) => event.date === "2026-08-12" && event.status !== "CANCELLED");
  const nowTop = ((toMinutes(model.now) - DAY_START) / DAY_SPAN) * 100;
  const hours = [6, 9, 12, 15, 18, 21, 23];

  return (
    <section className={styles.lensPanel} aria-label="Day capacity view">
      <div className={styles.lensHeader}>
        <div><span>DAY / CAPACITY</span><h2>{model.dayTitle}</h2></div>
        <p>Long commitments occupy real space. Open time stays visible instead of disappearing between cards.</p>
      </div>

      <div className={styles.capacityReadout}>
        <div><strong>10h</strong><span>committed</span></div>
        <div><strong>07h</strong><span>unclaimed / transition</span></div>
        <div><strong>03</strong><span>meaningful blocks</span></div>
      </div>

      <div className={styles.dayPlane}>
        <div className={styles.dayTimes}>{hours.map((hour) => <span key={hour} style={{ top: `${((hour * 60 - DAY_START) / DAY_SPAN) * 100}%` }}>{String(hour).padStart(2, "0")}</span>)}</div>
        <div className={styles.dayField}>
          {hours.map((hour) => <i className={styles.hourLine} key={hour} style={{ top: `${((hour * 60 - DAY_START) / DAY_SPAN) * 100}%` }} />)}
          {todayEvents.map((event) => <EventBlock event={event} key={event.id} />)}
          <div className={styles.nowLine} style={{ top: `${nowTop}%` }}><span>NOW · {model.now}</span><i /></div>
        </div>
      </div>

      <div className={styles.dayFooter}>
        <span><i data-category="Work" />fixed reality</span>
        <span><i data-category="Health" />important life</span>
        <span><i data-category="Learning" />flexible learning</span>
      </div>
    </section>
  );
}

function WeekLens({ model }: { model: CalendarViewModel }) {
  return (
    <section className={styles.lensPanel} aria-label="Week rhythm view">
      <div className={styles.lensHeader}>
        <div><span>WEEK / RHYTHM</span><h2>What kind of week is this?</h2></div>
        <p>Not seven miniature calendars. Each day is compressed into occupied space, open capacity, and the categories shaping it.</p>
      </div>

      <div className={styles.weekField}>
        {model.week.map((day) => {
          const total = day.occupiedMinutes + day.openMinutes;
          const occupied = Math.round((day.occupiedMinutes / total) * 100);
          return (
            <article className={styles.weekDay} data-today={day.date === "2026-08-12" ? "true" : "false"} key={day.date}>
              <div className={styles.weekDate}><span>{day.day}</span><strong>{day.number}</strong></div>
              <div className={styles.weekMeter} style={{ "--occupied": `${occupied}%` } as CSSProperties}><i /></div>
              <div className={styles.weekCategories}>{day.dominant.slice(0, 3).map((category) => <span data-category={category} key={category}>{categoryShort[category]}</span>)}</div>
              <small>{day.note}</small>
            </article>
          );
        })}
      </div>

      <div className={styles.weekInsight}>
        <Icon name="spark" size={18} />
        <div><span>LIFE OS PLANNING READ</span><strong>Friday is pressured; Sunday still has recovery room.</strong><p>Prototype observation only. The future AI can use this shape before proposing another creator session.</p></div>
      </div>
    </section>
  );
}

function MonthLens({ model }: { model: CalendarViewModel }) {
  const firstDay = model.month.days[0]?.date;
  const sundayIndex = firstDay ? new Date(`${firstDay}T00:00:00Z`).getUTCDay() : 1;
  const mondayOffset = (sundayIndex + 6) % 7;
  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <section className={styles.lensPanel} aria-label="Month texture view">
      <div className={styles.lensHeader}>
        <div><span>MONTH / TEXTURE</span><h2>{model.month.label}</h2></div>
        <p>Repeated work becomes texture. Only meaningful landmarks need words at this scale.</p>
      </div>

      <div className={styles.monthWeekdays}>{weekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
      <div className={styles.monthGrid}>
        {Array.from({ length: mondayOffset }, (_, index) => <span className={styles.monthBlank} key={`blank-${index}`} />)}
        {model.month.days.map((day) => (
          <article className={styles.monthDay} data-load={day.load} data-today={day.date === "2026-08-12" ? "true" : "false"} key={day.date}>
            <div><strong>{day.number}</strong>{day.landmark && <span>{day.landmark}</span>}</div>
            <div className={styles.monthMarks}>{day.categories.slice(0, 3).map((category) => <i data-category={category} title={category} key={category} />)}</div>
          </article>
        ))}
      </div>

      <div className={styles.monthLegend}><span>quiet</span><i data-load="1" /><i data-load="2" /><i data-load="3" /><i data-load="4" /><span>dense</span></div>
    </section>
  );
}

function YearLens({ model }: { model: CalendarViewModel }) {
  return (
    <section className={styles.lensPanel} aria-label="Year seasons view">
      <div className={styles.lensHeader}>
        <div><span>YEAR / SEASONS</span><h2>{model.year.label}</h2></div>
        <p>At year scale, appointments disappear. Pressure, recovery, travel, creator phases and other meaningful spans remain.</p>
      </div>

      <div className={styles.yearField}>
        {model.year.months.map((month, index) => (
          <article className={styles.yearMonth} data-current={index === 7 ? "true" : "false"} key={month.label}>
            <span>{month.short}</span>
            <div className={styles.yearTrack}><i style={{ width: `${month.load}%` }} /></div>
            <div className={styles.yearCategories}>{month.categories.slice(0, 3).map((category) => <i data-category={category} title={category} key={category} />)}</div>
            <strong>{month.landmark ?? ""}</strong>
          </article>
        ))}
      </div>

      <aside className={styles.yearNote}><span>ORIENTATION, NOT PRECISION</span><p>The year view should help answer “what shaped this year?” Detailed events remain available through month/day drill-down and Memory.</p></aside>
    </section>
  );
}

function RoutingState({ item }: { item: RoutedIntent }) {
  const label = item.state === "NEEDS_CONFIRMATION" ? "needs you" : item.state === "READY_TO_CONFIRM" ? "ready" : "routed";
  return <span className={styles.routeState} data-state={item.state}>{label}</span>;
}

function RoutingRail({ model }: { model: CalendarViewModel }) {
  return (
    <section className={styles.routingSection}>
      <div className={styles.routingHeader}>
        <div><span className="section-kicker">FROM CONVERSATION / SAMPLE</span><h2>Life OS heard time-shaped intent.</h2></div>
        <button disabled><Icon name="spark" size={16} /> Ask Life OS</button>
      </div>
      <p className={styles.routingIntro}>Routing is not the same as committing. Uncertain language stays uncertain until the user confirms what should become calendar reality.</p>
      <div className={styles.routeList}>
        {model.routedIntents.map((item) => (
          <details className={styles.routeItem} key={item.id}>
            <summary>
              <RoutingState item={item} />
              <div><q>{item.userWords}</q><span>{item.destination}{item.proposedWhen ? ` · ${item.proposedWhen}` : ""}</span></div>
              <Icon name="arrow" size={17} />
            </summary>
            <div className={styles.routeDetail}><strong>{item.interpretation}</strong><p>{item.reason}</p></div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CalendarDashboard({ model }: { model: CalendarViewModel }) {
  const [activeLens, setActiveLens] = useState<CalendarLens>("DAY");
  const activeMeta = useMemo(() => lenses.find((lens) => lens.id === activeLens) ?? lenses[0], [activeLens]);

  return (
    <div className="life-app">
      <AppNavigation />
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · SAMPLE</div>
        </header>

        {model.demoMode && (
          <details className="prototype-note">
            <summary>Calendar reality prototype <span>read-only sample</span></summary>
            <p>No AI parsing, persistence, external calendar sync, or scheduling writes are active. Routed plans and events below are fake data used to validate the information model.</p>
          </details>
        )}

        <section className={styles.hero}>
          <div className={styles.heroTop}><span>{model.dateLabel}</span><span>{model.timezone}</span></div>
          <div className={styles.heroGrid}>
            <div><span className="section-kicker">TIME-BOUND REALITY</span><h1>See the life your plans create.</h1></div>
            <p>Calendar is where dated reality takes shape—work, body, people, travel, learning, rest. It shows what occupies time and what room is still yours.</p>
          </div>
          <div className={styles.nowInstrument}><Icon name="clock" size={20} /><span>NOW</span><strong>{model.now}</strong><p>Wednesday still has one flexible learning window after gym.</p></div>
        </section>

        <section className={styles.lensSwitcher} aria-label="Calendar time lens">
          <div className={styles.switcherRail}>
            {lenses.map((lens) => <button key={lens.id} className={activeLens === lens.id ? styles.lensActive : ""} onClick={() => setActiveLens(lens.id)}><strong>{lens.label}</strong><span>{lens.question}</span></button>)}
          </div>
          <span className={styles.activeQuestion}>Viewing <strong>{activeMeta.question}</strong>, not merely {activeMeta.label.toLowerCase()} events.</span>
        </section>

        {activeLens === "DAY" && <DayLens model={model} />}
        {activeLens === "WEEK" && <WeekLens model={model} />}
        {activeLens === "MONTH" && <MonthLens model={model} />}
        {activeLens === "YEAR" && <YearLens model={model} />}

        <RoutingRail model={model} />

        <aside className={styles.ownershipNote}>
          <span>CALENDAR OWNS TIME, NOT THE WHOLE STORY</span>
          <p>A Sound learning block can live here as 20:15–21:00 while Journey stores what was actually understood. A trip can occupy five days here while Travel/Memory keep its deeper context. One fact can participate in several views without being duplicated as competing truth.</p>
        </aside>

        <footer className="page-footer"><span>Life OS / Calendar reality V1</span><span>artifact v1.1.0 · adaptive lenses · sample state</span></footer>
      </main>
    </div>
  );
}
