# Roguelike_Thing

Roguelike_Thing is a deterministic combat sandbox that separates simulation code, authored content, and presentation logic. Attack resolution is expressed as a pipeline of conversions, brands, polarity modifiers, and layered defenses so the entire damage breakdown is explicit and debuggable.

---

## ✅ Current capabilities

- **Deterministic combat resolver.** Attacks flow through conversion, brand, attunement, polarity, and defense stages before statuses apply, keeping the full context available for inspection tools such as the debug overlay.
- **Attunement and temporal systems.** Actors gain and decay elemental stacks that scale outgoing packets, interact with polarity, and influence per-turn resource regeneration and cooldown math; regression tests cover stacking, decay, and channeling behaviour.
- **Modular actor construction.** Factories register content definitions, fold equipment modifiers, and hydrate actors with innate packages so simulation runs match content authored for the browser build.
- **Status registry.** Canonical status definitions live under `src/combat/status-registry.js`, keeping damage-over-time and derived modifier logic centralized for both Node-based tests and the browser build.
- **Simulation harness.** `src/sim/sim.js` exposes a seeded matchup runner with simple planners and balance metrics that back automated tests.
- **Rendering and UI helpers.** The browser demo wires a canvas renderer, minimap, inventory slots, and lighting/field-of-view overlays around the shared simulation code.

---

## 📂 Repository layout

- `src/combat/` – core simulation: actors, attack context, turn loop, statuses, resources, and randomness controls.
- `src/content/` – authored game data (items, affixes, loot tables, mobs, status metadata) consumed by factories.
- `src/factories/` – helpers that register content, create items, and build actors with folded modifiers.
- `src/sim/` – batch simulation utilities and balance configuration used by regression tests.
- `src/ui/` – developer-facing overlays, sound hooks, and debugging helpers that plug into the renderer.
- `src/world/` – dungeon generation, furniture systems, and field-of-view calculations shared with the browser client.
- `js/render/` – renderer abstractions and controllers implemented for canvas and headless scenarios.
- `tests/` – Node-based regression, balance, and sandbox scripts invoked via the test runner.

---

## 🚀 Getting started

1. **Install dependencies.** The project currently relies on Node's built-in tooling; `npm install` is only required if optional packages are added later.
2. **Run the regression suite.**
   ```bash
   npm run test-basic
   ```
   The script executes `tests/run-basic-tests.js`, which imports targeted spec files and performs additional assertions for the combat, temporal, status, and save pipelines.
3. **Explore the browser demo.** Serve the repository root (for example with `npx serve .`) and open `index.html` to watch the self-playing dungeon crawl that uses the same combat modules, renderer, and content definitions as the tests.

---

## 🧪 Test suites

- **Regression harness** (`npm run test-basic`) covers folding logic, attack resolution, attunement decay, channeling, cooldown math, save/load hydration, RNG determinism, and core status ticking.
- **Focused specs** in `tests/*.test.js` can be executed individually with `node tests/<file>.js` for debugging specialised systems such as field-of-view, polarity math, and temporal echoes.
- **Manual and performance harnesses** (`tests/combat-sandbox.js`, `tests/phase3.manual.js`, `tests/phase4.perf.manual.js`) provide ad hoc simulations and should be migrated into automated coverage over time.

---

## 🛠 Development notes

- Items, brands, and affixes are registered once via `ensureItemsRegistered`, ensuring Node tests and the browser inventory agree on definitions before equipment folding occurs.
- The browser build reuses shared utilities (`src/config`, `src/world/fov`, `src/ui/sound`) through native ES module imports, so any simulation changes should be export-safe for both Node and browsers.
- Lighting overlays and field-of-view calculations in `src/world/fov.js` expose composable helpers for future renderer integrations or shader-based implementations.

---

## 📌 Roadmap snapshot

See `TASKS.md` for prioritised follow-up work items discovered during the latest evaluation.
