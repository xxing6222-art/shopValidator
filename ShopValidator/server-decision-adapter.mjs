import "./fact-store.js";
import "./decision-engine.js";
import "./interview-policy.js";

const decisionEngine = globalThis.DecisionEngine;
const interviewPolicy = globalThis.InterviewPolicy;

if (!decisionEngine || !interviewPolicy) {
  throw new Error("Server decision dependencies failed to initialize");
}

export function computeServerDecision(serverCase, overrides = {}) {
  return decisionEngine.toServerDeterministicResult(serverCase, overrides);
}

export function assessServerCase(serverCase, overrides = {}) {
  return decisionEngine.assessServerCase(serverCase, overrides);
}

export function assessServerFacts(facts, baseInput = {}) {
  return decisionEngine.assessServerFacts(facts, baseInput);
}

export function evaluateInterviewCompleteness(state) {
  return interviewPolicy.evaluateInterviewCompleteness(state);
}

export function sanitizeAgentNextQuestion(proposal, state) {
  return interviewPolicy.sanitizeAgentNextQuestion(proposal, state);
}

export function getRequiredInterviewFields(stage) {
  return interviewPolicy.getRequiredFields(stage);
}

export function getOptionalInterviewFields(stage) {
  return interviewPolicy.getOptionalFields(stage);
}

export function getAllowedInterviewFields(stage) {
  return interviewPolicy.getAllowedFields(stage);
}

// Every external answer, including model extraction and an edited transcript,
// enters the same schema/period/unit normalizer before it can affect a result.
export function normalizeServerFacts(rawFacts) {
  return globalThis.FactStore.adaptServerFacts(rawFacts);
}

export const INTERVIEW_LIMITS = Object.freeze({
  maxTurns: interviewPolicy.MAX_TURNS,
  maxAttemptsPerField: interviewPolicy.MAX_ATTEMPTS_PER_FIELD
});
