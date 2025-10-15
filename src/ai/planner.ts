import type {
  ExplorePolicy,
  ExplorePolicyDefinition,
  FormulaTable,
  GateState,
  ThresholdTable,
  WeightTable,
} from "./explore_policy";
import { getPolicyPreset, mergePolicies, normalizePolicy } from "./explore_policy";

export interface Candidate {
  goal: string;
  target?: unknown;
  metrics?: Record<string, number>;
  gates?: string[];
  thresholds?: ThresholdTable;
  weightOverrides?: WeightTable;
  formulaOverrides?: FormulaTable;
  description?: string;
  baseScore?: number;
  context?: Record<string, number>;
}

export interface PlannerContext {
  policy?: string | ExplorePolicy | ExplorePolicyDefinition;
  overrides?: Partial<ExplorePolicyDefinition>;
  environment?: Record<string, number>;
  gateOverrides?: GateState;
  metricAugment?: Record<string, number>;
}

export interface TermBreakdown {
  id: string;
  weight: number;
  value: number;
  raw: number;
  contribution: number;
  formula?: string;
}

export interface PlannerExplain {
  goal: string;
  target: unknown;
  score: number;
  policy: { id: string; label: string };
  summary: string;
  breakdown: Record<string, TermBreakdown>;
}

export interface PlanDecision {
  goal: string;
  target: unknown;
  score: number;
  breakdown: Record<string, TermBreakdown>;
  policy: ExplorePolicy;
  candidate: Candidate;
  explain: PlannerExplain;
}

const SAFE_FORMULA = /^[0-9+\-*/%().,_ a-zA-Z\[\]]+$/;
const UNSAFE_TOKENS = /(constructor|__proto__|prototype|Function|globalThis|process|require)/i;

const clamp01 = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));

function resolvePolicy(
  input?: string | ExplorePolicy | ExplorePolicyDefinition,
  overrides?: Partial<ExplorePolicyDefinition>,
): ExplorePolicy {
  if (!input) {
    const preset = getPolicyPreset("cartographer");
    return overrides ? mergePolicies(preset, overrides) : preset;
  }
  if (typeof input === "string") {
    const preset = getPolicyPreset(input);
    return overrides ? mergePolicies(preset, overrides) : preset;
  }
  if (input && typeof input === "object" && "pathCost" in input && input.switches && input.weights) {
    return overrides ? mergePolicies(input, overrides) : normalizePolicy(input);
  }
  return mergePolicies(normalizePolicy(input), overrides);
}

function safeEval(formula: string, scope: Record<string, number>): number {
  if (!SAFE_FORMULA.test(formula)) {
    throw new Error(`Unsafe formula: ${formula}`);
  }
  if (UNSAFE_TOKENS.test(formula)) {
    throw new Error(`Unsafe token in formula: ${formula}`);
  }
  const keys = Object.keys(scope);
  const fn = new Function(...keys, "Math", `"use strict"; return (${formula});`);
  const values = keys.map((key) => scope[key]);
  const result = fn(...values, Math);
  return Number.isFinite(result) ? Number(result) : 0;
}

function computeBreakdown(
  candidate: Candidate,
  policy: ExplorePolicy,
  context: PlannerContext,
  sharedMetrics: Record<string, number>,
): { total: number; breakdown: Record<string, TermBreakdown> } {
  const weights: WeightTable = {
    ...policy.weights,
    ...(candidate.weightOverrides ?? {}),
  };
  const formulas: FormulaTable = {
    ...policy.formulas,
    ...(candidate.formulaOverrides ?? {}),
  };

  const breakdown: Record<string, TermBreakdown> = {};
  let total = Number(candidate.baseScore ?? 0);

  for (const [key, rawValue] of Object.entries(candidate.metrics ?? {})) {
    const weight = Number(weights[key] ?? 0);
    if (!Number.isFinite(weight) || weight === 0) continue;

    const scope = {
      ...sharedMetrics,
      ...(candidate.metrics ?? {}),
      ...(candidate.context ?? {}),
      ...(context.environment ?? {}),
      base: rawValue,
      value: rawValue,
      weight,
    } as Record<string, number>;

    let value = rawValue;
    const formula = formulas[key];
    if (typeof formula === "string" && formula.length > 0) {
      try {
        value = safeEval(formula, scope);
      } catch {
        value = rawValue;
      }
    }

    if (!Number.isFinite(value)) value = rawValue;
    const contribution = value * weight;
    total += contribution;
    const entry: TermBreakdown = { id: key, weight, value, raw: rawValue, contribution };
    if (typeof formula === "string" && formula.length > 0) {
      entry.formula = formula;
    }
    breakdown[key] = entry;
  }

  return { total, breakdown };
}

function summarize(breakdown: Record<string, TermBreakdown>): string {
  const parts = Object.values(breakdown)
    .filter((term) => term.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map((term) => `${term.id}:${term.contribution.toFixed(2)}`);
  return parts.length > 0 ? parts.join(", ") : "neutral";
}

function gateState(policy: ExplorePolicy, ctx: PlannerContext): GateState {
  return {
    ...policy.switches,
    ...policy.gates,
    ...(ctx.gateOverrides ?? {}),
  };
}

function gatherMetrics(candidate: Candidate, policy: ExplorePolicy, ctx: PlannerContext): Record<string, number> {
  return {
    ...policy.thresholds,
    ...(ctx.metricAugment ?? {}),
    ...(ctx.environment ?? {}),
    ...(candidate.metrics ?? {}),
    ...(candidate.context ?? {}),
  };
}

function passesGates(candidate: Candidate, gates: GateState): boolean {
  const required = candidate.gates ?? [];
  for (const gate of required) {
    if (!gates[gate]) return false;
  }
  return true;
}

function passesThresholds(candidate: Candidate, policy: ExplorePolicy, ctx: PlannerContext, metrics: Record<string, number>): boolean {
  const thresholds: ThresholdTable = {
    ...policy.thresholds,
    ...(candidate.thresholds ?? {}),
  };
  for (const [key, threshold] of Object.entries(thresholds)) {
    if (!Number.isFinite(threshold)) continue;
    const value = metrics[key];
    if (value === undefined) continue;
    if (value < threshold) {
      return false;
    }
  }
  return true;
}

export function evaluateCandidates(candidates: Candidate[], ctx: PlannerContext = {}): PlanDecision | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const policy = resolvePolicy(ctx.policy, ctx.overrides);
  const gates = gateState(policy, ctx);

  let best: PlanDecision | null = null;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.goal !== "string") continue;
    if (!passesGates(candidate, gates)) continue;
    const metrics = gatherMetrics(candidate, policy, ctx);
    if (!passesThresholds(candidate, policy, ctx, metrics)) continue;

    const { total, breakdown } = computeBreakdown(candidate, policy, ctx, metrics);
    const decision: PlanDecision = {
      goal: candidate.goal,
      target: candidate.target ?? null,
      score: total,
      breakdown,
      policy,
      candidate,
      explain: {
        goal: candidate.goal,
        target: candidate.target ?? null,
        score: total,
        policy: { id: policy.id, label: policy.label },
        breakdown,
        summary: summarize(breakdown),
      },
    };

    if (!best || decision.score > best.score) {
      best = decision;
    }
  }

  const result = best;

  try {
    if (typeof window !== "undefined") {
      window.__AI_LAST_DECISION = result ?? null;
    }
  } catch {
    // ignore errors when the global object is unavailable or read-only
  }

  return result;
}

export function explainDecision(decision: PlanDecision | null): PlannerExplain | null {
  return decision ? decision.explain : null;
}

declare global {
  interface Window {
    __AI_LAST_DECISION?: PlanDecision | null;
  }
}

export { clamp01 };
