import { getPolicyPreset, mergePolicies, normalizePolicy } from "./explore_policy.js";

const SAFE_FORMULA = /^[0-9+\-*/%().,_ a-zA-Z\[\]]+$/;
const UNSAFE_TOKENS = /(constructor|__proto__|prototype|Function|globalThis|process|require)/i;

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function resolvePolicy(input, overrides) {
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

function safeEval(formula, scope) {
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

function computeBreakdown(candidate, policy, context, sharedMetrics) {
  const weights = { ...policy.weights, ...(candidate.weightOverrides ?? {}) };
  const formulas = { ...policy.formulas, ...(candidate.formulaOverrides ?? {}) };

  const breakdown = {};
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
    };

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
    breakdown[key] = { id: key, weight, value, raw: rawValue, contribution, formula };
  }

  return { total, breakdown };
}

function summarize(breakdown) {
  const parts = Object.values(breakdown || {})
    .filter((term) => term.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map((term) => `${term.id}:${term.contribution.toFixed(2)}`);
  return parts.length > 0 ? parts.join(", ") : "neutral";
}

function gateState(policy, ctx) {
  return {
    ...policy.switches,
    ...policy.gates,
    ...(ctx.gateOverrides ?? {}),
  };
}

function gatherMetrics(candidate, policy, ctx) {
  return {
    ...policy.thresholds,
    ...(ctx.metricAugment ?? {}),
    ...(ctx.environment ?? {}),
    ...(candidate.metrics ?? {}),
    ...(candidate.context ?? {}),
  };
}

function passesGates(candidate, gates) {
  const required = candidate.gates ?? [];
  for (const gate of required) {
    if (!gates[gate]) return false;
  }
  return true;
}

function passesThresholds(candidate, policy, ctx, metrics) {
  const thresholds = {
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

export function evaluateCandidates(candidates, ctx = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const policy = resolvePolicy(ctx.policy, ctx.overrides);
  const gates = gateState(policy, ctx);

  let best = null;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.goal !== "string") continue;
    if (!passesGates(candidate, gates)) continue;
    const metrics = gatherMetrics(candidate, policy, ctx);
    if (!passesThresholds(candidate, policy, ctx, metrics)) continue;

    const { total, breakdown } = computeBreakdown(candidate, policy, ctx, metrics);
    const decision = {
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

  return best;
}

export function explainDecision(decision) {
  return decision ? decision.explain : null;
}

export { clamp01 };
