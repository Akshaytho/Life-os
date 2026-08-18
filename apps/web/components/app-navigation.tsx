"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTodayPath } from "../lib/navigation-paths";
import styles from "./app-navigation.module.css";

type IconName = "today" | "journey" | "calendar" | "memory" | "you" | "plus";
type NavItem = { label: string; icon: IconName; href?: string; match?: (path: string) => boolean };

const navItems: NavItem[] = [
  { label: "Today", icon: "today", href: "/", match: isTodayPath },
  { label: "Journey", icon: "journey", href: "/journey", match: (path) => path.startsWith("/journey") },
  { label: "Calendar", icon: "calendar", href: "/calendar", match: (path) => path.startsWith("/calendar") },
  { label: "Memory", icon: "memory", href: "/memory", match: (path) => path.startsWith("/memory") },
  { label: "You", icon: "you", href: "/you", match: (path) => path.startsWith("/you") },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "today") return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" /></svg>;
  if (name === "journey") return <svg {...common}><path d="M4 18c4-8 7-11 16-13" /><circle cx="5" cy="18" r="2" /><path d="m16 4 4 1-1 4" /></svg>;
  if (name === "calendar") return <svg {...common}><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" /><path d="M7 2v4M17 2v4M3 9h18" /></svg>;
  if (name === "memory") return <svg {...common}><path d="M6 3h10a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z" /><path d="M8 21a3 3 0 0 1 0-6h11M9 8h6M9 11h4" /></svg>;
  if (name === "you") return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-4.1 3-6.1 6.5-6.1s5.7 2 6.5 6.1" /></svg>;
  return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
}

function Destination({ item, path, desktop = false }: { item: NavItem; path: string; desktop?: boolean }) {
  const active = item.match?.(path) ?? false;
  const content = <><Icon name={item.icon} size={desktop ? 21 : 19} /><span>{item.label}</span></>;

  if (!item.href) return <button className={`${styles.destination} ${desktop ? styles.desktopDestination : ""}`} disabled>{content}</button>;

  return (
    <Link href={item.href} className={`${styles.destination} ${desktop ? styles.desktopDestination : ""} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined}>
      {content}
    </Link>
  );
}

export function AppNavigation() {
  const path = usePathname();
  const captureActive = path.startsWith("/capture");
  const driftActive = path.startsWith("/drift");

  return (
    <>
      <aside className={styles.desktopDock} aria-label="Primary navigation">
        <div className={styles.brand}><strong>L/O</strong><span>PRIVATE</span></div>
        <div className={styles.desktopLinks}>{navItems.map((item) => <Destination item={item} path={path} desktop key={item.label} />)}</div>
        <Link href="/drift" className={`${styles.desktopDrift} ${driftActive ? styles.driftActive : ""}`} aria-current={driftActive ? "page" : undefined}>
          <span>I&apos;m<br />drifting</span>
        </Link>
        <Link href="/capture" className={`${styles.desktopCapture} ${captureActive ? styles.captureActive : ""}`} aria-current={captureActive ? "page" : undefined}>
          <Icon name="plus" size={22} /><span>Brain Dump</span>
        </Link>
      </aside>

      <Link href="/drift" className={`${styles.mobileDrift} ${driftActive ? styles.driftActive : ""}`} aria-current={driftActive ? "page" : undefined}>
        I&apos;m drifting
      </Link>
      <nav className={styles.mobileDock} aria-label="Primary navigation">
        <Destination item={navItems[0]} path={path} />
        <Destination item={navItems[1]} path={path} />
        <Link href="/capture" className={`${styles.mobileCapture} ${captureActive ? styles.captureActive : ""}`} aria-label="Brain Dump" aria-current={captureActive ? "page" : undefined}>
          <Icon name="plus" size={23} /><span>Brain Dump</span>
        </Link>
        <Destination item={navItems[2]} path={path} />
        <Destination item={navItems[3]} path={path} />
        <Destination item={navItems[4]} path={path} />
      </nav>
    </>
  );
}
