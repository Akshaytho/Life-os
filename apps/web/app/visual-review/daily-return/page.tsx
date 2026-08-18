import { notFound } from "next/navigation";
import { LiveDailyReturn } from "../../../components/live-daily-return";
import todayStyles from "../../../components/live-today.module.css";

function visualReviewEnabled() {
  return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

export default function DailyReturnVisualReviewPage() {
  if (!visualReviewEnabled()) notFound();

  return (
    <div className="life-app">
      <main className={todayStyles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · VISUAL REVIEW</div>
        </header>

        <LiveDailyReturn
          accessToken="visual-review-access-token"
          localDate="2026-08-18"
          timeZone="Asia/Kolkata"
        />
      </main>
    </div>
  );
}
