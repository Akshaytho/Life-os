import styles from "./route-state.module.css";

export default function Loading() {
  return (
    <main className={styles.shell} aria-busy="true" aria-live="polite">
      <section className={styles.panel}>
        <span className={styles.kicker}>LIFE / OS · PRIVATE ROUTE</span>
        <h1>Loading current state.</h1>
        <p>Life OS is preparing this screen. No sample or substitute life data is shown while the real route is loading.</p>
        <div className={styles.pulse} aria-hidden="true" />
      </section>
    </main>
  );
}
