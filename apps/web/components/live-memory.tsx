"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  memoryKinds,
  type MemoryCandidate,
  type MemoryItem,
  type MemoryKind,
  type MemoryOverview,
  type RetainMemoryItemCommand,
  type ReviseMemoryItemCommand,
} from "../../../packages/contracts/memory";
import {
  getMemoryOverview,
  LifeOsApiError,
  retainMemoryItem,
  reviseMemoryItem,
} from "../lib/life-os-api";
import { useLifeOsAuth } from "./life-os-auth-provider";
import styles from "./live-memory.module.css";

type RetentionDraft = { candidate: MemoryCandidate; kind: MemoryKind; title: string; body: string };
type RevisionDraft = { item: MemoryItem; kind: MemoryKind; title: string; body: string };

function label(value: string) { return value.replaceAll("_", " ") }
function date(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function safeMessage(error: unknown) {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session expired before Memory completed.";
    if (error.code === "memory_unavailable" || error.code === "not_found") return "Memory is not enabled in this private runtime yet.";
    if (error.code === "candidate_already_retained") return "That exact source has already been retained once.";
    if (error.code === "current_memory_changed") return "This Memory changed after it loaded. Life OS refused the stale revision.";
    if (error.code === "memory_unchanged") return "Those exact words are already the current Memory version.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Memory boundary. The same write can be retried safely.";
  }
  return "Life OS could not complete that Memory operation. Private details were not exposed.";
}

export function LiveMemory({ visualOverview }: { visualOverview?: MemoryOverview }) {
  const { session } = useLifeOsAuth();
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [overview, setOverview] = useState<MemoryOverview | undefined>(visualOverview);
  const [query, setQuery] = useState(visualOverview?.query ?? "");
  const [kind, setKind] = useState<MemoryKind | "ALL">(visualOverview?.kind ?? "ALL");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(visualOverview ? "Synthetic visual-review context · no database call" : "");
  const [retention, setRetention] = useState<RetentionDraft>();
  const [revision, setRevision] = useState<RevisionDraft>();
  const [pending, setPending] = useState<{ fingerprint: string; key: string }>();

  useEffect(() => {
    if (visualOverview || !session?.access_token) return;
    void load(session.access_token, "", "ALL");
  }, [session?.access_token, visualOverview]);

  async function load(accessToken: string, requestedQuery = query, requestedKind = kind) {
    setBusy(true);
    setMessage("Retrieving by authority and exact provenance…");
    try {
      const value = await getMemoryOverview(accessToken, {
        timeZone,
        ...(requestedQuery.trim() ? { query: requestedQuery.trim() } : {}),
        ...(requestedKind !== "ALL" ? { kind: requestedKind } : {}),
      });
      setOverview(value);
      setMessage(value.items.length
        ? `${value.items.length} retained ${value.items.length === 1 ? "memory" : "memories"} matched without a similarity score.`
        : "No retained Memory matched. Empty stays truthful.");
    } catch (error) { setMessage(safeMessage(error)) }
    finally { setBusy(false) }
  }

  function stableKey(scope: string, value: object) {
    const fingerprint = `${scope}:${JSON.stringify(value)}`;
    if (pending?.fingerprint === fingerprint) return pending.key;
    const key = `${scope}-${crypto.randomUUID()}`;
    setPending({ fingerprint, key });
    return key;
  }

  async function commitRetention() {
    if (!session?.access_token || !retention || visualOverview) return;
    const command: RetainMemoryItemCommand = {
      sourceDomain: retention.candidate.domain,
      sourceEntityId: retention.candidate.entityId,
      kind: retention.kind,
      title: retention.title,
      body: retention.body,
      relationship: "NEW",
    };
    setBusy(true);
    setMessage("Retaining this exact source as REFLECTION…");
    try {
      const receipt = await retainMemoryItem(session.access_token, command, stableKey("memory-retain", command));
      setPending(undefined);
      setRetention(undefined);
      setMessage(receipt.status === "replayed"
        ? "This retention had already committed safely; Life OS returned the same receipt."
        : "Retained as REFLECTION. The source and its owning domain did not change.");
      await load(session.access_token);
    } catch (error) { setMessage(safeMessage(error)); setBusy(false) }
  }

  async function commitRevision() {
    if (!session?.access_token || !revision || visualOverview) return;
    const command: ReviseMemoryItemCommand = {
      expectedCurrentItemId: revision.item.itemId,
      kind: revision.kind,
      title: revision.title,
      body: revision.body,
    };
    setBusy(true);
    setMessage("Writing a new Memory version while preserving history…");
    try {
      const receipt = await reviseMemoryItem(
        session.access_token, revision.item.rootId, command, stableKey("memory-revise", command),
      );
      setPending(undefined);
      setRevision(undefined);
      setMessage(receipt.status === "replayed"
        ? "This revision had already committed safely; Life OS returned the same receipt."
        : "Memory revised. The earlier version remains in history.");
      await load(session.access_token);
    } catch (error) { setMessage(safeMessage(error)); setBusy(false) }
  }

  const unretained = (overview?.candidates ?? []).filter((candidate) => !candidate.retainedRootId);
  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar"><div className="wordmark">LIFE<span>/</span>OS</div><div className="system-state"><i />PRIVATE · MEMORY</div></header>

        <section className={styles.hero}>
          <span className="section-kicker">TRUST BEFORE RECENCY</span>
          <h1>Remember without<br />flattening history.</h1>
          <p>Find retained context, see how much authority it has, and inspect the source that gave it meaning.</p>
          <Link href="/">Return to Today</Link>
        </section>

        <section className={styles.recall} aria-label="Memory recall">
          <div><span>RECALL / PERSISTED MEMORY</span><span>NO VECTOR SCORE</span></div>
          <form onSubmit={(event) => { event.preventDefault(); if (session?.access_token) void load(session.access_token) }}>
            <label><span>WORDS TO RECALL</span><input disabled={busy || Boolean(visualOverview)} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder="What did I learn about sound, returning, or attention?" value={query} /></label>
            <label><span>TYPE</span><select disabled={busy || Boolean(visualOverview)} onChange={(event) => setKind(event.target.value as MemoryKind | "ALL")} value={kind}><option value="ALL">All retained types</option>{memoryKinds.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
            <button disabled={busy || Boolean(visualOverview)} type="submit">{busy ? "RETRIEVING…" : "RECALL →"}</button>
          </form>
          <p>Deterministic word filtering only. Current owners stay above retained reflection; no similarity or confidence score decides truth.</p>
        </section>

        {message && <section className={styles.status} aria-live="polite"><span>MEMORY BOUNDARY</span><p>{message}</p></section>}

        <section className={styles.section}>
          <div className={styles.heading}><div><span>01 / TRUSTED NOW</span><h2>References to what owns truth now.</h2></div><p>Memory can retrieve these anchors. You, Journey, and Calendar remain their canonical owners.</p></div>
          <div className={styles.anchors}>
            {(overview?.trustedNow ?? []).map((item, index) => <Link href={item.href ?? "#"} key={item.referenceId}><small>{String(index + 1).padStart(2, "0")} · OWNER {item.owner}</small><strong>{item.label}</strong><h3>{item.value}</h3>{item.detail && <p>{item.detail}</p>}<span>{item.authorityClass} · {date(item.occurredAt)}</span></Link>)}
            {overview && overview.trustedNow.length === 0 && <div className={styles.empty}>No current owner references were retrieved.</div>}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.heading}><div><span>02 / CANDIDATES</span><h2>Worth considering—not automatic Memory.</h2></div><p>These words remain source reflections until you explicitly decide to retain one.</p></div>
          <div className={styles.candidates}>
            {unretained.map((candidate) => <article key={candidate.candidateId}><div><span>{label(candidate.domain)} · REFLECTION</span><time>{date(candidate.occurredAt)}</time></div><h3>{candidate.suggestedTitle}</h3><p>{candidate.body}</p><small>{candidate.label}</small><button disabled={busy || Boolean(visualOverview)} onClick={() => setRetention({ candidate, kind: candidate.domain === "JOURNEY_PRACTICE" ? "LEARNING" : "REFLECTION", title: candidate.suggestedTitle, body: candidate.body })} type="button">Review to retain →</button></article>)}
            {overview && unretained.length === 0 && <div className={styles.empty}>No unreviewed Memory candidates. Nothing was manufactured.</div>}
          </div>
        </section>

        {retention && <section className={styles.confirm}>
          <span>EXPLICIT RETENTION · USER DECISION</span><h2>Retain this as reflection?</h2>
          <p>Retention does not make this a fact or decision. It does not change the Review or Journey source.</p>
          <label><span>TYPE</span><select disabled={busy} onChange={(event) => setRetention({ ...retention, kind: event.target.value as MemoryKind })} value={retention.kind}>{memoryKinds.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label><span>TITLE</span><input disabled={busy} maxLength={200} onChange={(event) => setRetention({ ...retention, title: event.target.value })} value={retention.title} /></label>
          <label><span>MEMORY WORDS · REFLECTION</span><textarea disabled={busy} maxLength={4000} onChange={(event) => setRetention({ ...retention, body: event.target.value })} rows={5} value={retention.body} /></label>
          <div><button disabled={busy} onClick={() => setRetention(undefined)} type="button">Keep as candidate</button><button disabled={busy || !retention.title.trim() || !retention.body.trim()} onClick={() => void commitRetention()} type="button">Retain with source</button></div>
        </section>}

        <section className={styles.section}>
          <div className={styles.heading}><div><span>03 / WORTH KEEPING</span><h2>Selected history with its authority intact.</h2></div><p>Every item is typed, versioned, and linked to the exact source that seeded it.</p></div>
          <div className={styles.memories}>
            {(overview?.items ?? []).map((item, index) => <article key={item.rootId}>
              <div className={styles.memoryIndex}>{String(index + 1).padStart(2, "0")}</div>
              <div><div className={styles.meta}><span>{label(item.kind)} · {item.authorityClass}</span><span>VERSION {item.revision}</span></div><h3>{item.title}</h3><p>{item.body}</p>{item.relationship !== "NEW" && <aside>{item.relationship} · {item.relatedTitle ?? item.relatedRootId}</aside>}<details><summary>Provenance + history</summary><p><b>{item.source.label}</b><br />{item.source.domain} · {date(item.source.occurredAt)}</p>{item.history.map((version) => <p key={version.itemId}><b>Version {version.revision} · {version.status}</b><br />{version.title}: {version.body}</p>)}</details><button disabled={busy || Boolean(visualOverview)} onClick={() => setRevision({ item, kind: item.kind, title: item.title, body: item.body })} type="button">Revise without erasing →</button></div>
            </article>)}
            {overview && overview.items.length === 0 && <div className={styles.empty}>No retained Memory matched this recall.</div>}
          </div>
        </section>

        {revision && <section className={styles.confirm}>
          <span>NEW VERSION · HISTORY PRESERVED</span><h2>Revise this Memory?</h2><p>The current version becomes historical. Its source, root identity, and reflection authority remain intact.</p>
          <label><span>TYPE</span><select disabled={busy} onChange={(event) => setRevision({ ...revision, kind: event.target.value as MemoryKind })} value={revision.kind}>{memoryKinds.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label><span>TITLE</span><input disabled={busy} maxLength={200} onChange={(event) => setRevision({ ...revision, title: event.target.value })} value={revision.title} /></label>
          <label><span>MEMORY WORDS · REFLECTION</span><textarea disabled={busy} maxLength={4000} onChange={(event) => setRevision({ ...revision, body: event.target.value })} rows={5} value={revision.body} /></label>
          <div><button disabled={busy} onClick={() => setRevision(undefined)} type="button">Keep current version</button><button disabled={busy || !revision.title.trim() || !revision.body.trim()} onClick={() => void commitRevision()} type="button">Create next version</button></div>
        </section>}

        <section className={styles.section}>
          <div className={styles.heading}><div><span>04 / TIME COMPRESSION</span><h2>Month, then week, then source.</h2></div><p>Reviews own compression. Memory makes that reflection retrievable without pretending it is current fact.</p></div>
          {overview?.timeCompression.month ? <div className={styles.time}><Link href={overview.timeCompression.month.href}><span>MONTH · REFLECTION</span><h3>{overview.timeCompression.month.title}</h3><p>{overview.timeCompression.month.summary}</p></Link><div>{overview.timeCompression.weeks.map((week) => <Link href={week.href} key={week.reviewId}><span>{week.periodStart} — {week.periodEnd}</span><strong>{week.title}</strong><p>{week.summary}</p></Link>)}</div></div> : overview && <div className={styles.empty}>No monthly review exists yet. Memory did not invent a summary.</div>}
        </section>

        <aside className={styles.boundary}><strong>No automatic Memory.</strong><p>AI cannot retain, revise, merge, or resolve these records. Current owners still own; contradictions stay unresolved; every write requires your explicit confirmation.</p></aside>
        <footer className={styles.footer}><span>MEMORY-ACTIVATION-V1</span><span>VERSIONED · SOURCED · RLS-SCOPED</span></footer>
      </main>
    </div>
  );
}
