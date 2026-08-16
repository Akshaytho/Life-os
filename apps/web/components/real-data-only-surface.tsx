import Link from "next/link";
import styles from "./real-data-only-surface.module.css";

interface RealDataOnlySurfaceProps {
  area: string;
  title: string;
  description: string;
}

export function RealDataOnlySurface({ area, title, description }: RealDataOnlySurfaceProps) {
  return (
    <div className={styles.page}>
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state">PRIVATE · REAL DATA ONLY</div>
        </header>

        <section className={styles.hero}>
          <span className="section-kicker">{area.toUpperCase()} · CANONICAL DATA</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </section>

        <section className={styles.statusCard} aria-label={`${area} availability`}>
          <div className={styles.topline}>
            <span>DATA SOURCE</span>
            <span>NOT CONNECTED YET</span>
          </div>
          <h2>No sample life data will be shown here.</h2>
          <p>
            This surface stays unavailable until it has a real authenticated read model backed by canonical Life OS storage.
            Life OS will not substitute demo records, inferred personal history, or placeholder facts.
          </p>
          <div className={styles.actions}>
            <Link href="/">Today</Link>
            <Link href="/capture">Capture / Review</Link>
            <Link href="/calendar">Calendar</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
