"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  brainDumpCategories,
  notNowAssessments,
  notNowPostures,
  type BrainDumpCategory,
  type NotNowAssessment,
  type NotNowPosture,
} from "../../../packages/contracts/brain-dump-not-now";
import {
  confirmBrainDumpClassification,
  getBrainDumpOverview,
  LifeOsApiError,
  parkNotNowItem,
} from "../lib/life-os-api";
import styles from "./brain-dump-not-now-controls.module.css";

const categoryLabels: Record<BrainDumpCategory, string> = {
  GOAL: "Goal",
  IDEA: "Idea",
  PROBLEM: "Problem",
  EMOTION: "Emotion",
  PERSON: "Person",
  CONCERN: "Concern",
  TASK: "Task",
  LEARNING: "Learning",
  TRAVEL: "Travel",
  CONTENT: "Content",
  CAREER: "Career",
  DIET: "Diet",
  NOT_NOW: "NOT NOW",
};

const assessmentLabels: Record<NotNowAssessment, string> = {
  TEMPORARY_INSPIRATION: "Temporary inspiration",
  WORTH_RESEARCHING: "Worth researching",
  GENUINE_DIRECTION_CHANGE: "Genuine change in direction",
  EMOTIONAL_REACTION: "Emotional reaction",
  UNSURE: "Unsure",
};

const postureLabels: Record<NotNowPosture, string> = {
  PARK_IT: "Park it",
  RESEARCH_WITHOUT_COMMITTING: "Research without committing",
  DELAY_DECISION: "Delay the decision",
};

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "brain_dump_not_now_unavailable" || error.code === "not_found") {
      return "Brain Dump organization is present but not enabled in this private runtime yet.";
    }
    if (error.code === "current_classification_changed") return "The classification changed after this view loaded. Life OS refused the stale decision.";
    if (error.code === "classification_unchanged") return "That category is already the current organizational decision.";
    if (error.code === "not_now_item_exists") return "This thought is already in NOT NOW.";
    if (error.code === "not_now_classification_required") return "Confirm NOT NOW as the category before parking this thought.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Brain Dump boundary. The same decision can be retried safely.";
  }
  return "Life OS could not organize this thought. The raw Capture remains safe and unchanged.";
}

export function BrainDumpNotNowControls({
  accessToken,
  captureId,
}: {
  accessToken: string;
  captureId: string;
}) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentCategory, setCurrentCategory] = useState<BrainDumpCategory | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<BrainDumpCategory | "">("");
  const [assessment, setAssessment] = useState<NotNowAssessment | "">("");
  const [posture, setPosture] = useState<NotNowPosture | "">("");
  const [parkingReview, setParkingReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const classificationAttempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  const parkingAttempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);

  useEffect(() => {
    void load();
  }, [accessToken, captureId]);

  async function load() {
    setBusy(true);
    try {
      const overview = await getBrainDumpOverview(accessToken);
      const item = overview.items.find((candidate) => candidate.captureId === captureId);
      const classification = item?.currentClassification ?? null;
      setCurrentId(classification?.id ?? null);
      setCurrentCategory(classification?.category ?? null);
      setSelectedCategory(classification?.category ?? "");
      setMessage(classification
        ? `Current category: ${categoryLabels[classification.category]}. This is organizational only.`
        : "Choose a category only when it helps. The original thought is already saved.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCategory() {
    if (!selectedCategory) return;
    const command = {
      category: selectedCategory,
      expectedCurrentClassificationId: currentId,
    };
    const fingerprint = JSON.stringify(command);
    const attempt = classificationAttempt.current?.fingerprint === fingerprint
      ? classificationAttempt.current
      : { fingerprint, key: crypto.randomUUID() };
    classificationAttempt.current = attempt;
    setBusy(true);
    setMessage("Recording your category decision without changing any other Life OS domain…");
    try {
      const receipt = await confirmBrainDumpClassification(
        accessToken,
        captureId,
        command,
        attempt.key,
      );
      classificationAttempt.current = undefined;
      setCurrentId(receipt.classificationId);
      setCurrentCategory(receipt.category);
      setParkingReview(false);
      setMessage(receipt.status === "replayed"
        ? "The earlier category decision was safely replayed."
        : `${categoryLabels[receipt.category]} is now the current organizational category. Nothing was promoted.`);
    } catch (error) {
      if (error instanceof LifeOsApiError && error.code === "current_classification_changed") {
        await load();
        classificationAttempt.current = undefined;
      } else {
        setMessage(safeMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function park() {
    if (!currentId || currentCategory !== "NOT_NOW" || !assessment || !posture) return;
    const command = {
      captureId,
      classificationId: currentId,
      assessment,
      posture,
      expectedCurrentItemId: null as null,
    };
    const fingerprint = JSON.stringify(command);
    const attempt = parkingAttempt.current?.fingerprint === fingerprint
      ? parkingAttempt.current
      : { fingerprint, key: crypto.randomUUID() };
    parkingAttempt.current = attempt;
    setBusy(true);
    setMessage("Parking this thought as a deliberate non-commitment…");
    try {
      const receipt = await parkNotNowItem(accessToken, command, attempt.key);
      parkingAttempt.current = undefined;
      setParkingReview(false);
      setMessage(receipt.status === "replayed"
        ? "The earlier NOT NOW decision was safely replayed."
        : "This thought is in NOT NOW. Direction, Journey, Calendar, Today, and Memory did not change.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.surface} aria-label="Brain Dump classification and NOT NOW parking">
      <header>
        <div><span>BRAIN DUMP / USER DECISION</span><h2>Organize the thought. Do not turn it into a commitment.</h2></div>
        <Link href="/not-now">Open NOT NOW</Link>
      </header>

      <div className={styles.classificationRow}>
        <label htmlFor={`brain-dump-category-${captureId}`}>Organizational category</label>
        <select
          disabled={busy}
          id={`brain-dump-category-${captureId}`}
          onChange={(event) => {
            setSelectedCategory(event.target.value as BrainDumpCategory | "");
            classificationAttempt.current = undefined;
            setParkingReview(false);
          }}
          value={selectedCategory}
        >
          <option value="">Choose only if useful</option>
          {brainDumpCategories.map((category) => (
            <option key={category} value={category}>{categoryLabels[category]}</option>
          ))}
        </select>
        <button
          disabled={busy || !selectedCategory || selectedCategory === currentCategory}
          onClick={() => void confirmCategory()}
          type="button"
        >Confirm category</button>
      </div>

      {currentCategory === "DIET" && (
        <p className={styles.boundary}>Diet is a label only. The deferred Diet module remains inactive.</p>
      )}

      {currentCategory === "NOT_NOW" && (
        <div className={styles.parkingFlow}>
          <div className={styles.flowHeading}>
            <span>DELIBERATE PAUSE</span>
            <h3>What is this—and how should Life OS hold it?</h3>
          </div>
          <fieldset>
            <legend>Closest description</legend>
            {notNowAssessments.map((value) => (
              <label key={value}><input checked={assessment === value} disabled={busy} name={`assessment-${captureId}`} onChange={() => { setAssessment(value); setParkingReview(false); }} type="radio" /><span>{assessmentLabels[value]}</span></label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Next posture</legend>
            {notNowPostures.map((value) => (
              <label key={value}><input checked={posture === value} disabled={busy} name={`posture-${captureId}`} onChange={() => { setPosture(value); setParkingReview(false); }} type="radio" /><span>{postureLabels[value]}</span></label>
            ))}
          </fieldset>
          <button disabled={busy || !assessment || !posture} onClick={() => setParkingReview(true)} type="button">Review parking decision</button>
        </div>
      )}

      {parkingReview && assessment && posture && (
        <aside className={styles.finalReview}>
          <span>FINAL REVIEW · NO WRITE YET</span>
          <dl>
            <div><dt>This feels like</dt><dd>{assessmentLabels[assessment]}</dd></div>
            <div><dt>Life OS will</dt><dd>{postureLabels[posture]}</dd></div>
            <div><dt>What changes</dt><dd>Organizational state only</dd></div>
            <div><dt>What does not change</dt><dd>Direction, Journey, Calendar, Today, Memory, goals, and projects</dd></div>
          </dl>
          <div><button disabled={busy} onClick={() => setParkingReview(false)} type="button">Edit</button><button disabled={busy} onClick={() => void park()} type="button">Park in NOT NOW</button></div>
        </aside>
      )}

      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}
