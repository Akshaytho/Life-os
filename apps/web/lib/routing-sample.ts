import type {
  RoutingInterpretation,
  RoutingObservation,
  RoutingProposal,
} from "../../../packages/contracts/input-routing";

export const captureExamples = [
  "My friend may visit Saturday evening.",
  "I want to go to Goa next month.",
  "Yes, Sep 12-16 is decided.",
  "I learned why room tone matters.",
  "I want to become a filmmaker now.",
  "My shoulder felt uncomfortable today.",
  "I am drifting.",
] as const;

function observation(id: string, label: string, value: string): RoutingObservation {
  return { id, label, value, trustClass: "OBSERVATION" };
}

function proposal(value: RoutingProposal): RoutingProposal {
  return value;
}

function normalize(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function has(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function interpretCapture(rawInput: string): RoutingInterpretation {
  const input = normalize(rawInput);
  const lower = input.toLowerCase();

  if (!input) {
    return {
      input,
      intent: "UNKNOWN",
      certainty: "UNSPECIFIED",
      confidence: 0,
      observations: [],
      proposals: [],
      clarification: "Write something you want Life OS to understand first.",
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  if (has(lower, ["drifting", "i'm drifting", "i am drifting", "lost direction"])) {
    return {
      input,
      intent: "DRIFT_SIGNAL",
      certainty: "CONFIRMED",
      confidence: 0.98,
      observations: [
        observation("intent", "Intent", "Return / drift support"),
        observation("authority", "Authority", "User explicitly reported drift"),
      ],
      proposals: [
        proposal({
          id: "drift-flow",
          destination: "DRIFT",
          operation: "START_DRIFT_FLOW",
          summary: "Open the return flow without creating a new goal or changing direction.",
          targetTrustClass: "FACT",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "The user explicitly said they are drifting; the appropriate owner is the cross-cutting Drift system.",
          preview: [
            { label: "State", value: "User-reported drift" },
            { label: "Next", value: "Classify → return / reconsider" },
          ],
        }),
      ],
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  if (has(lower, ["learned", "learnt", "i learned", "i learnt"])) {
    return {
      input,
      intent: "LEARNING",
      certainty: "CONFIRMED",
      confidence: 0.94,
      observations: [
        observation("intent", "Intent", "Learning evidence"),
        observation("owner", "Likely owner", "Journey"),
      ],
      proposals: [
        proposal({
          id: "journey-learning",
          destination: "JOURNEY",
          operation: "RECORD_LEARNING_EVIDENCE",
          summary: "Record this as user-reported learning evidence under the active capability.",
          targetTrustClass: "FACT",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "Journey owns deliberate capability learning and evidence. The sentence is the source; any AI paraphrase would remain interpretation.",
          preview: [
            { label: "Evidence", value: "Learning" },
            { label: "Source", value: "User capture" },
          ],
        }),
      ],
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  if (has(lower, ["filmmaker", "change my direction", "new direction", "become a director", "become a filmmaker"])) {
    return {
      input,
      intent: "DIRECTION_RECONSIDERATION",
      certainty: "LIKELY",
      confidence: 0.9,
      observations: [
        observation("intent", "Intent", "Direction / identity reconsideration"),
        observation("risk", "Authority", "Potential high-authority change"),
      ],
      proposals: [
        proposal({
          id: "direction-reconsideration",
          destination: "YOU",
          operation: "PROPOSE_DIRECTION_RECONSIDERATION",
          summary: "Preserve this as reconsideration; do not replace the active Journey or direction automatically.",
          targetTrustClass: "REFLECTION",
          approvalMode: "HIGH_AUTHORITY_APPROVAL",
          state: "NEEDS_CONFIRMATION",
          reason: "Identity-level language can be genuine reconsideration or temporary drift. The canonical direction must not be superseded silently.",
          preview: [
            { label: "Current effect", value: "No direction change" },
            { label: "Possible next step", value: "Explore → deliberate decision" },
          ],
        }),
      ],
      clarification: "Do you want to explore this thought, park it, or deliberately reconsider your current direction?",
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  if (has(lower, ["shoulder", "pain", "hurt", "uncomfortable", "sore"])) {
    return {
      input,
      intent: "HEALTH_OBSERVATION",
      certainty: "CONFIRMED",
      confidence: 0.92,
      observations: [
        observation("intent", "Intent", "User-reported health observation"),
        observation("boundary", "Safety boundary", "No diagnosis inferred"),
      ],
      proposals: [
        proposal({
          id: "health-memory",
          destination: "MEMORY",
          operation: "RECORD_MEMORY",
          summary: "Preserve the user's report of discomfort as a dated personal observation, without diagnosing it.",
          targetTrustClass: "FACT",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "The user can report their own experience. Life OS should preserve the statement and provenance, not infer a medical cause.",
          preview: [
            { label: "Type", value: "User-reported health observation" },
            { label: "Diagnosis", value: "None" },
          ],
        }),
      ],
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  const isTentative = has(lower, ["maybe", "may ", "might", "thinking about", "want to go", "could "]);
  const isConfirmed = has(lower, ["decided", "confirmed", "booked", "definitely", "yes,"]);
  const hasTravel = has(lower, ["goa", "trip", "travel", "flight", "hotel"]);
  const hasFriend = has(lower, ["friend", "friends"]);
  const hasDateLanguage = has(lower, ["today", "tomorrow", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "sep ", "september", "next month", "evening", "morning"]);

  if (hasTravel && isTentative && !isConfirmed) {
    return {
      input,
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.93,
      observations: [
        observation("intent", "Intent", "Possible travel"),
        observation("certainty", "Certainty", "Tentative / exploratory"),
      ],
      proposals: [
        proposal({
          id: "travel-not-now",
          destination: "NOT_NOW",
          operation: "PARK_NOT_NOW",
          summary: "Preserve the travel possibility without reserving Calendar time yet.",
          targetTrustClass: "REFLECTION",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "The wording expresses desire rather than a committed trip. Life OS should preserve the possibility without manufacturing a commitment.",
          preview: [
            { label: "Status", value: "Possibility" },
            { label: "Calendar", value: "No blocked time" },
          ],
        }),
      ],
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  if ((hasDateLanguage || hasFriend || hasTravel) && (isConfirmed || !isTentative)) {
    const explicitDecision = isConfirmed && hasDateLanguage;
    const proposals: RoutingProposal[] = [
      proposal({
        id: "calendar-plan",
        destination: "CALENDAR",
        operation: "CREATE_CALENDAR_PLAN",
        summary: explicitDecision
          ? "Create the confirmed dated plan on Calendar."
          : "Create a dated plan after the missing commitment details are confirmed.",
        targetTrustClass: "FACT",
        approvalMode: explicitDecision ? "REVIEW_AND_APPLY" : "EXPLICIT_CONFIRMATION",
        state: explicitDecision ? "READY_TO_APPLY" : "NEEDS_CONFIRMATION",
        reason: "Calendar owns time-bound reality and plans.",
        preview: [
          { label: "Category", value: hasTravel ? "Travel" : hasFriend ? "Friends" : "Unresolved" },
          { label: "Commitment", value: explicitDecision ? "Confirmed" : "Needs confirmation" },
        ],
      }),
    ];

    if (explicitDecision) {
      proposals.push(
        proposal({
          id: "dated-decision",
          destination: "MEMORY",
          operation: "RECORD_DECISION",
          summary: "Preserve that these dates were explicitly decided, with the capture as provenance.",
          targetTrustClass: "DECISION",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "The user's wording explicitly finalizes the dated plan; decision history remains retrievable separately from the Calendar projection. Missing category context is not invented.",
        }),
      );
    }

    return {
      input,
      intent: "DATED_PLAN",
      certainty: explicitDecision ? "CONFIRMED" : "LIKELY",
      confidence: 0.91,
      observations: [
        observation("intent", "Intent", explicitDecision ? "Confirmed dated plan" : "Dated social / personal plan"),
        observation("time", "Time language", "Detected in user input"),
        ...(explicitDecision && !hasTravel && !hasFriend
          ? [observation("category", "Category", "Not enough context — left unresolved")]
          : []),
      ],
      proposals,
      clarification: explicitDecision ? undefined : "Should this become a real Calendar commitment, and what exact time should Life OS reserve?",
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  if (isTentative && (hasDateLanguage || hasFriend)) {
    return {
      input,
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.88,
      observations: [
        observation("intent", "Intent", "Tentative dated plan"),
        observation("certainty", "Certainty", "Not committed"),
      ],
      proposals: [
        proposal({
          id: "tentative-calendar",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Prepare a tentative Calendar plan, but do not reserve committed time yet.",
          targetTrustClass: "SUGGESTION",
          approvalMode: "EXPLICIT_CONFIRMATION",
          state: "NEEDS_CONFIRMATION",
          reason: "Time language is present, but the user's wording is uncertain.",
          preview: [
            { label: "State", value: "Tentative" },
            { label: "Commitment", value: "Unconfirmed" },
          ],
        }),
      ],
      clarification: "Is this something you want to hold tentatively on Calendar, or only remember as a possibility?",
      interpreter: "LOCAL_SAMPLE",
      sourceActor: "USER",
    };
  }

  return {
    input,
    intent: "RAW_THOUGHT",
    certainty: "UNSPECIFIED",
    confidence: 0.42,
    observations: [
      observation("understanding", "Understanding", "No safe structured interpretation"),
    ],
    proposals: [
      proposal({
        id: "raw-capture",
        destination: "BRAIN_DUMP",
        operation: "KEEP_RAW_CAPTURE",
        summary: "Keep the original thought intact instead of pretending to understand it.",
        targetTrustClass: "REFLECTION",
        approvalMode: "REVIEW_AND_APPLY",
        state: "READY_TO_APPLY",
        reason: "Unknown input should fail safely into raw capture, preserving the user's words for later classification.",
      }),
    ],
    interpreter: "LOCAL_SAMPLE",
    sourceActor: "USER",
  };
}
