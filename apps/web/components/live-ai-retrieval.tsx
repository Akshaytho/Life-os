"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  aiInteractionModes,
  type AiContextSource,
  type AiInteractionMode,
  type AskLifeOsResponse,
} from "../../../packages/contracts/ai-retrieval";
import { askLifeOs, LifeOsApiError } from "../lib/life-os-api";
import { useLifeOsAuth } from "./life-os-auth-provider";
import styles from "./live-ai-retrieval.module.css";

const modeLabels: Record<AiInteractionMode, { label: string; prompt: string }> = {
  ASK: { label: "Ask", prompt: "What does Life OS know that is relevant?" },
  REFLECT: { label: "Reflect", prompt: "What may be worth noticing?" },
  DECIDE: { label: "Decide", prompt: "Which evidence and constraints matter?" },
  REVIEW: { label: "Review", prompt: "What actually happened?" },
  RESET: { label: "Reset", prompt: "What helps me return without judgment?" },
  PLAN: { label: "Plan", prompt: "What is realistic around current commitments?" },
  CHALLENGE: { label: "Challenge", prompt: "Which assumption deserves examination?" },
};

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session expired before this read-only question completed.";
    if (error.code === "context_unavailable") return "Life OS has no canonical context for this question yet. It did not invent an answer.";
    if (error.code === "ai_unavailable") return "The read-only AI provider is unavailable. Life OS returned no fallback answer.";
    if (error.code === "ai_response_invalid") return "The provider response failed the source and authority contract, so Life OS refused it.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private retrieval boundary.";
    if (error.code === "not_found") return "Ask Life OS retrieval is not enabled in this private runtime yet.";
  }
  return "Life OS could not complete this read-only question. Private provider details were not exposed.";
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SourceCard({ source, cited }: { source: AiContextSource; cited: boolean }) {
  return (
    <article className={styles.sourceCard} data-cited={cited ? "true" : "false"}>
      <div className={styles.sourceTop}>
        <span>{source.domain} · {source.authorityClass}</span>
        <span>{cited ? "CITED" : "RETRIEVED"}</span>
      </div>
      <h3>{source.title}</h3>
      <p>{source.excerpt}</p>
      <time>{dateTimeLabel(source.occurredAt)}</time>
    </article>
  );
}

export function LiveAiRetrieval({
  visualResponse,
  visualQuestion,
}: {
  visualResponse?: AskLifeOsResponse;
  visualQuestion?: string;
} = {}) {
  const { session } = useLifeOsAuth();
  const [mode, setMode] = useState<AiInteractionMode>(visualResponse?.mode ?? "ASK");
  const [question, setQuestion] = useState(visualQuestion ?? "");
  const [response, setResponse] = useState<AskLifeOsResponse | undefined>(visualResponse);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(visualResponse ? "Synthetic visual-review context · no provider call" : "");
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const cited = new Set(response?.citedSourceIds ?? []);
  const citedSources = response?.sources.filter((source) => cited.has(source.sourceId)) ?? [];
  const uncitedSources = response?.sources.filter((source) => !cited.has(source.sourceId)) ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = session?.access_token;
    if (!accessToken || visualResponse) return;
    const now = new Date();
    const calendarTo = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setBusy(true);
    setResponse(undefined);
    setMessage("Assembling a small canonical context package…");
    try {
      const value = await askLifeOs(accessToken, {
        mode,
        question,
        localDate: localDate(now),
        timeZone,
        calendarFrom: now.toISOString(),
        calendarTo: calendarTo.toISOString(),
      });
      setResponse(value);
      setMessage("Read-only answer complete. No Life OS state changed and this screen did not save a chat transcript.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function clearLocal() {
    if (visualResponse) return;
    setQuestion("");
    setResponse(undefined);
    setMessage("Cleared from this screen only. No Life OS state changed.");
  }

  return (
    <main className={styles.canvas}>
      <header className="system-bar">
        <div className="wordmark">LIFE<span>/</span>OS</div>
        <div className="system-state"><i />PRIVATE · ASK / READ ONLY</div>
      </header>

      <section className={styles.hero}>
        <span>CONTEXT, NOT CONTROL</span>
        <h1>Ask from what<br />is actually known.</h1>
        <div>
          <p>Life OS retrieves a small set of current decisions, facts, and reflections. AI can help you think with them. It cannot change them.</p>
          <Link href="/">Return to Today</Link>
        </div>
      </section>

      <form className={styles.askForm} onSubmit={submit}>
        <div className={styles.sectionTitle}>
          <span>01 / CHOOSE THE LENS</span>
          <strong>You choose what kind of help this is.</strong>
          <p>The lens changes context priority. It never changes source authority.</p>
        </div>
        <div className={styles.modeGrid}>
          {aiInteractionModes.map((item) => (
            <button
              aria-pressed={mode === item}
              disabled={busy || Boolean(visualResponse)}
              key={item}
              onClick={() => {
                setMode(item);
                setResponse(undefined);
              }}
              type="button"
            >
              <strong>{modeLabels[item].label}</strong>
              <span>{modeLabels[item].prompt}</span>
            </button>
          ))}
        </div>

        <label className={styles.questionField}>
          <span>02 / YOUR QUESTION · PRIVATE USER SOURCE</span>
          <textarea
            disabled={busy || Boolean(visualResponse)}
            maxLength={2000}
            onChange={(event) => {
              setQuestion(event.target.value);
              setResponse(undefined);
            }}
            placeholder={modeLabels[mode].prompt}
            required
            rows={4}
            value={question}
          />
        </label>
        <div className={styles.formActions}>
          <button className={styles.primary} disabled={busy || Boolean(visualResponse) || !question.trim()} type="submit">
            {busy ? "Reading context…" : visualResponse ? "Visual review · no provider call" : "Ask from current context"}
          </button>
          <button className={styles.secondary} disabled={busy || Boolean(visualResponse) || (!question && !response)} onClick={clearLocal} type="button">Clear this screen</button>
        </div>
        <p className={styles.boundary}>NO TOOLS · NO WRITES · NO AUTO-MEMORY · NO GOALS · NO SCHEDULE CHANGES</p>
      </form>

      {message && <p className={styles.message} role="status">{message}</p>}

      {response && (
        <section className={styles.result} aria-label="Read-only Ask Life OS answer">
          <div className={styles.answerTop}>
            <span>AI OBSERVATION · READ ONLY</span>
            <span>{modeLabels[response.mode].label} · {dateTimeLabel(response.generatedAt)}</span>
          </div>
          <p className={styles.answer}>{response.answer}</p>
          <div className={styles.answerBoundary}>
            <strong>Nothing changed.</strong>
            <span>This answer is not a fact, decision, Memory item, plan, or saved conversation.</span>
          </div>

          <div className={styles.sourcesHeader}>
            <div><span>SUPPORT / INSPECTABLE</span><h2>Cited canonical context</h2></div>
            <p>{citedSources.length} of {response.sources.length} retrieved sources cited</p>
          </div>
          <div className={styles.sourceList}>
            {citedSources.length > 0
              ? citedSources.map((source) => <SourceCard cited key={source.sourceId} source={source} />)
              : <p className={styles.noCitations}>The answer cited no source and should be read only as a request for clarification.</p>}
          </div>

          {uncitedSources.length > 0 && (
            <details className={styles.moreContext}>
              <summary>Inspect {uncitedSources.length} additional retrieved {uncitedSources.length === 1 ? "source" : "sources"}</summary>
              <div className={styles.sourceList}>{uncitedSources.map((source) => <SourceCard cited={false} key={source.sourceId} source={source} />)}</div>
            </details>
          )}

          <footer className={styles.resultFooter}>
            <span>{response.policyVersion}</span>
            <span>MODEL · {response.modelName}</span>
          </footer>
        </section>
      )}
    </main>
  );
}
