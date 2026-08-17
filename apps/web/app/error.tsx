"use client";

import Link from "next/link";
import styles from "./route-state.module.css";

export default function Error({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className={styles.shell}>
      <section className={styles.panel} role="alert">
        <span className={styles.kicker}>LIFE / OS · ROUTE UNAVAILABLE</span>
        <h1>This screen could not load safely.</h1>
        <p>Life OS kept provider and runtime details private instead of rendering an internal error. Retry this route or return to Today.</p>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>Retry route</button>
          <Link href="/today">Return to Today</Link>
        </div>
      </section>
    </main>
  );
}
