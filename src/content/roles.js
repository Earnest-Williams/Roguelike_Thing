// src/content/roles.js
// @ts-check

/**
 * Role templates capture light-weight overlays that can be applied to base mob
 * templates. They are intentionally modular so that encounter builders can mix
 * and match battlefield roles without mutating the underlying species data.
 */

/**
 * @typedef {Object} RoleTemplate
 * @property {string} id
 * @property {string} label
 * @property {Record<string, number>=} statMods
 * @property {Record<string, number>=} affinities
 * @property {Record<string, number>=} resists
 * @property {{
 *   grant?: Record<string, number>,
 *   onHitBias?: Record<string, number>,
 *   defenseBias?: Record<string, number>,
 * }=} polarity
 * @property {Record<string, number>=} aiHints
 * @property {string=} statusLoadout
 * @property {string=} notes
 */

/**
 * Static catalogue of role templates. Each entry is validated on load so that
 * malformed data surfaces immediately during development or test runs.
 *
 * The templates roughly mirror the legacy role overlays that previously lived
 * inside `themes.js`, but are now reusable by any spawning system.
 *
 * - `statMods` apply directly to an actor's base stats.
 * - `affinities` and `resists` are folded through the innate mod pipeline.
 * - `polarity` grants modify an actor's baseline polarity/bias vectors.
 * - `aiHints` are aggregated onto the actor for planners to read.
 */
export const ROLE_TEMPLATES = Object.freeze({
  role_vanguard_captain: Object.freeze({
    id: "role_vanguard_captain",
    label: "Vanguard Captain",
    statMods: Object.freeze({ vit: 2, con: 1, maxHP: 6 }),
    resists: Object.freeze({ slash: 0.15, fire: 0.05 }),
    affinities: Object.freeze({ blunt: 0.05 }),
    polarity: Object.freeze({
      grant: Object.freeze({ order: 0.08 }),
      defenseBias: Object.freeze({ order: 0.04 }),
    }),
    aiHints: Object.freeze({ aggression: 0.6, preferredRange: 1 }),
    statusLoadout: "ember_burn",
    notes: "Turns a base creature into a shield-bearing frontliner for ember-soaked catacombs.",
  }),
  role_ritual_chorus: Object.freeze({
    id: "role_ritual_chorus",
    label: "Ritual Chorus",
    statMods: Object.freeze({ int: 2, will: 1, maxMana: 8 }),
    resists: Object.freeze({ arcane: 0.1, poison: 0.05 }),
    affinities: Object.freeze({ arcane: 0.1, radiant: 0.05 }),
    polarity: Object.freeze({
      grant: Object.freeze({ growth: 0.07 }),
      onHitBias: Object.freeze({ growth: 0.05 }),
    }),
    aiHints: Object.freeze({ supportBias: 0.8, preferredRange: 4 }),
    statusLoadout: "tempest_sting",
    notes: "Adds support-focused spellcasters that reinforce ritual-heavy mechanics.",
  }),
  role_skirmisher_pack: Object.freeze({
    id: "role_skirmisher_pack",
    label: "Skirmisher Pack",
    statMods: Object.freeze({ dex: 2, maxStamina: 4, baseSpeed: 0.05 }),
    resists: Object.freeze({ pierce: 0.1, lightning: 0.05 }),
    affinities: Object.freeze({ pierce: 0.08 }),
    polarity: Object.freeze({
      onHitBias: Object.freeze({ chaos: 0.04 }),
    }),
    aiHints: Object.freeze({ mobility: 0.7, preferredRange: 2 }),
    statusLoadout: "glacial_chill",
    notes: "Leans into mobile harassment units for trap-laden goblin redoubts.",
  }),
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateNumberMap(scope, payload) {
  if (!payload) return;
  if (typeof payload !== "object") {
    throw new Error(`${scope} must be an object of numeric entries`);
  }
  for (const [key, value] of Object.entries(payload)) {
    if (!isFiniteNumber(value)) {
      throw new Error(`${scope}.${key} must be a finite number`);
    }
  }
}

function validatePolarity(scope, payload) {
  if (!payload) return;
  if (typeof payload !== "object") {
    throw new Error(`${scope} must be an object`);
  }
  if (payload.grant) validateNumberMap(`${scope}.grant`, payload.grant);
  if (payload.onHitBias) validateNumberMap(`${scope}.onHitBias`, payload.onHitBias);
  if (payload.defenseBias) validateNumberMap(`${scope}.defenseBias`, payload.defenseBias);
}

function validateRoleTemplate(template) {
  if (!template?.id) {
    throw new Error("Role template missing id");
  }
  if (typeof template.id !== "string") {
    throw new Error(`Role template id must be a string (${template.id})`);
  }
  if (!template.label || typeof template.label !== "string") {
    throw new Error(`Role template ${template.id} missing label`);
  }
  validateNumberMap(`${template.id}.statMods`, template.statMods);
  validateNumberMap(`${template.id}.affinities`, template.affinities);
  validateNumberMap(`${template.id}.resists`, template.resists);
  validateNumberMap(`${template.id}.aiHints`, template.aiHints);
  validatePolarity(`${template.id}.polarity`, template.polarity);
  if (template.statusLoadout != null && typeof template.statusLoadout !== "string") {
    throw new Error(`${template.id}.statusLoadout must be a string when provided`);
  }
}

for (const template of Object.values(ROLE_TEMPLATES)) {
  validateRoleTemplate(template);
}

/**
 * Lookup helper that returns a frozen role template or `null` when unknown.
 * @param {string} id
 * @returns {RoleTemplate|null}
 */
export function getRoleTemplate(id) {
  if (!id || typeof id !== "string") return null;
  return ROLE_TEMPLATES[id] || null;
}

/**
 * Normalize arbitrary role id inputs into a deduplicated array of strings.
 * @param {string|string[]|null|undefined} input
 * @returns {string[]}
 */
export function normalizeRoleIdList(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const out = [];
  const seen = new Set();
  for (const value of list) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    if (!ROLE_TEMPLATES[id]) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Resolve a list of role ids to their concrete templates.
 * @param {string[]} ids
 * @returns {RoleTemplate[]}
 */
export function resolveRoleTemplates(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const out = [];
  for (const id of ids) {
    const tpl = getRoleTemplate(id);
    if (tpl) out.push(tpl);
  }
  return out;
}

