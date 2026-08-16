import { LiveDirection } from "../../components/live-direction";
import styles from "../../components/live-direction.module.css";

function liveDirectionConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED?.trim().toLowerCase() === "true"
    && process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

function DormantDirection() {
  return (
    <div className={styles.page}>
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state">PRIVATE · YOU</div>
        </header>
        <section className={styles.hero}>
          <span className="section-kicker">CURRENT DIRECTION · DECISION</span>
          <h1>Your Direction belongs to you.</h1>
          <p>This high-authority surface is deliberately not live in this deployment yet. Life OS will not substitute sample data or an AI guess while canonical Direction is dormant.</p>
        </section>
        <section className={styles.currentCard}>
          <div className={styles.cardTopline}><span>CANONICAL STATE</span><span>DORMANT</span></div>
          <div className={styles.empty}>Direction will become available here only after the reviewed database migration, least-privilege role grants and private runtime composition are activated together.</div>
        </section>
      </main>
    </div>
  );
}

export default function YouPage() {
  if (liveDirectionConfigured()) return <LiveDirection />;
  return <DormantDirection />;
}
