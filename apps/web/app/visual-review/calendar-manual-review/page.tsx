import { notFound } from "next/navigation";
import { ManualCalendarCommitmentForm } from "../../../components/manual-calendar-commitment";
import styles from "../../../components/live-canonical-calendar.module.css";

function enabled() {
  return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

export default function Page() {
  if (!enabled()) notFound();
  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar"><div className="wordmark">LIFE<span>/</span>OS</div><div className="system-state"><i />PRIVATE · CALENDAR</div></header>
        <section className={styles.hero}>
          <div className={styles.heroTop}><span>CALENDAR / SYNTHETIC VISUAL REVIEW</span><span>FINAL REVIEW</span></div>
          <div className={styles.heroGrid}><div><span className="section-kicker">TIME-BOUND REALITY</span><h1>Commit time. See what is real.</h1></div><p>The draft is still non-canonical until the final action.</p></div>
        </section>
        <ManualCalendarCommitmentForm
          accessToken="synthetic-visual-only"
          initialDraft={{
            title: "Evening gym session",
            startsLocal: "2026-08-22T18:00",
            endsLocal: "2026-08-22T19:00",
            category: "Health",
            commitment: "Important",
          }}
          initialStage="REVIEW"
        />
      </main>
    </div>
  );
}
