# Copilot Project Instructions (TypeScript–First)

These instructions steer Copilot (inline, chat, PR) so suggestions match our repo’s architecture and migration plan. Treat everything below as non-negotiable defaults.

---

## 1) Ground Rules

* **ES Modules only.** No CommonJS, no transpiler assumptions.
* **New code = TypeScript.** All new source files **must** use `.ts` (or `.tsx` if React/JSX appears).
* **Gradual migration.** When you touch a JS module, prefer converting it to TS in the same PR or add accurate `.d.ts` shims and convert soon after.
* **Browser-friendly.** Keep relative ESM imports (no path aliases unless already configured).
* **No heavy deps by default.** Favor stdlib, DOM, Canvas, and our existing utilities.

---

## 2) TypeScript Policy (strict by default)

* **Strictness:** Target strict mode. Assume the project uses or will move to:

  * `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`,
  * `noImplicitOverride: true`, `noPropertyAccessFromIndexSignature: true`,
  * `useDefineForClassFields: true`, `skipLibCheck: true`.
* **Types over interfaces where helpful.** Prefer `type` aliases with discriminated unions for game data and state packets; use interfaces for public class shapes.
* **Avoid `any`.** Use `unknown` + narrow, or precise unions. If you must use `any`, localize it and leave a `// TODO(ts-migrate)` note.
* **Enums:** Prefer `as const` object literals + union types over TS `enum` unless bit-flags are required.
* **Narrowing:** Use type guards and `satisfies` to keep data tables sound:

```ts
const DAMAGE_TYPE = { Physical: 'physical', Fire: 'fire' } as const;
type DamageType = typeof DAMAGE_TYPE[keyof typeof DAMAGE_TYPE];

const FIRE_BRAND = {
  id: 'fire_brand',
  type: 'brand',
  element: DAMAGE_TYPE.Fire,
} as const satisfies BrandDef;
```

---

## 3) File & Folder Conventions

* **Source:** `src/**` uses `.ts`. If a JS file remains, add a sibling `.d.ts` or `// @ts-check` + JSDoc types as a stopgap.
* **Types:** Place shared domain types under `src/types/**`. Ambient declarations go in `types/**/*.d.ts`.
* **Public APIs:** When converting, keep the export surface stable. If you must change it, update all imports and tests in the same PR.

---

## 4) Migration Playbooks

### A) Converting a JS module to TS

1. Rename `foo.js → foo.ts`.
2. Add precise exported types:

```ts
export type HitPoints = { current: number; max: number };
export interface Actor {
  id: string;
  hp: HitPoints;
  // …
}
```

3. Replace magic strings with unions backed by `as const` registries.
4. Remove implicit `this` usage; make dependencies explicit via params.
5. Add unit tests or tighten existing ones if types exposed new edge cases.

### B) Adding a new system/file

* Create `src/<domain>/<feature>.ts`.
* Define a public type (`<Feature>Options`, `<Feature>Result`) and export a single entry (`create<Feature>` or `run<Feature>`).
* Write minimal runtime checks for external inputs; rely on types for internal calls.

### C) Interop with still-JS code

* Add `types/legacy.d.ts` with minimal, accurate shapes for JS modules you haven’t converted yet.
* If a legacy function is too dynamic, wrap it in a typed adapter in TS.

---

## 5) Domain Guidance (keep these invariants)

* **Combat/Status/Affinities pipeline**: Extend the existing order of operations; do **not** create parallel flows. Add types for each stage (e.g., `AttackPacket`, `DerivedModifiers`, `AppliedStatuses`) and keep them discriminated by `kind`.
* **Items/Weapons/Throwables**: Register through the central registry/factory. Add `satisfies ItemDef` checks to content tables.
* **Rendering**: Preserve the renderer interface (e.g., `init`, `setViewTransform`, `drawTiles`, `drawMinimap`, `resize`). Presentation logic belongs in presenters, not core state.

---

## 6) Example Patterns Copilot Should Prefer

**Discriminated unions for statuses**

```ts
type StatusId = 'bleed' | 'poison' | 'slow';

type BaseStatus = { id: StatusId; stacks: number; duration: number };
type DamageOverTime = BaseStatus & { kind: 'dot'; dps: number; damageType: DamageType };
type Debuff = BaseStatus & { kind: 'debuff'; speedMul?: number; defenseMul?: number };

type Status = DamageOverTime | Debuff;

function tickStatus(s: Status, dt: number) {
  if (s.kind === 'dot') return { damage: s.dps * dt, type: s.damageType };
  return { damage: 0, type: null as const };
}
```

**Data tables with `satisfies`**

```ts
type WeaponDef = {
  id: string;
  tags: readonly ('melee' | 'ranged' | 'throwable')[];
  baseDamage: number;
  damageType: DamageType;
};

export const WEAPONS = [
  { id: 'short_sword', tags: ['melee'], baseDamage: 6, damageType: DAMAGE_TYPE.Physical },
  { id: 'fire_dagger', tags: ['melee'], baseDamage: 3, damageType: DAMAGE_TYPE.Fire },
] as const satisfies readonly WeaponDef[];
```

---

## 7) Tests & “Done” Criteria

A PR is **done** when:

* ✅ New/changed modules are `.ts` and compile with repo settings.
* ✅ Public types exported from touched modules are documented (inline or `src/types/**`).
* ✅ Tests updated/added where logic changed. Run the basic test runner locally.
* ✅ No `any` leaks across module boundaries.
* ✅ No renderer API or input hotkey regressions.

---

## 8) Commit / PR Hygiene (for generated messages)

* **Title:** Imperative and specific.
  *Example:* “Convert combat/resolve to TS and add AttackPacket types.”
* **Body:** What changed, why, which modules, notes on migration (old JS → TS), and tests touched.
* **Checklist:**

  * [ ] New code in TS.
  * [ ] No API breaks without test updates.
  * [ ] Types tightened (`unknown`/guards instead of `any`).
  * [ ] Data tables use `satisfies` + `as const`.

---

## 9) Anti-Goals

* ❌ Do not add new JS files.
* ❌ Do not weaken types to make errors disappear. Fix the code or model.
* ❌ Do not invent new taxonomies for damage/status/affinity; extend existing unions.
* ❌ Do not introduce build tooling or path aliases unless part of an approved migration step.

---

## 10) Optional tsconfig guardrails (for Copilot context)

If Copilot needs to propose config changes, prefer this shape:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "useDefineForClassFields": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests", "types"]
}
```

---
