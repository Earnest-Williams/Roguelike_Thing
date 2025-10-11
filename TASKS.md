
---

## 🧭 **Proposed `TASKS.md` (independent version)**

```markdown
# Task Tracker

Structured list of development goals, bug fixes, and expansion milestones for Roguelike_Thing.

---

## ⚙️ 1. Core Simulation

- [ ] Implement **attunement decay loop**:
  - Gain and per-turn loss of elemental alignment.
  - Write test to ensure stack behavior matches spec.

- [ ] Finalize **polarity interaction**:
  - Clamp opposition and bias values within safe ranges.
  - Unit tests for opposed vs. neutral matchups.

- [ ] Improve **status tick and rebuild**:
  - Confirm `tickStatusesAtTurnStart` updates derived modifiers accurately.
  - Add developer log output for active effects.

- [ ] Refine **resource regeneration**:
  - Test stationary channeling bonuses and regen multipliers.
  - Add stamina/mana change indicators in debug output.

---

## 🎨 2. Rendering Layer

- [ ] Finalize `IRenderer` interface under `/js/render/types.ts`.
- [ ] Implement both `canvas-renderer` and `null-renderer` using same API.
- [ ] Add combat log, status icons, and viewport feedback.
- [ ] Integrate lighting and field-of-view, reducing flicker near player.

---

## 🧱 3. Content Expansion

- [ ] Create 10+ elemental weapon effects (fire, cold, shock, acid, etc.).
- [ ] Add example items combining multiple modifiers.
- [ ] Add 5+ unique status effects (burn, bleed, poison, haste, stun).
- [ ] Add initial enemy and spell definitions for combat testing.

---

## 🧪 4. Testing

- [ ] Unit test: attack resolution total matches expected per type.
- [ ] Unit test: folded modifier aggregation accuracy.
- [ ] Integration test: multi-turn status tick/expire cycle.
- [ ] Regression test: equip/unequip rebuild consistency.

---

## 🧰 5. Cleanup and Documentation

- [ ] Fix duplicate `clamp01` definition.
- [ ] Rename `calcCircumCirc` → `calcCircumCircle`.
- [ ] Remove outdated hybrid-generator comments.
- [ ] Expand top-level documentation and module docstrings.
- [ ] Add `/docs/architecture.png` showing system relationships.

---

## 📅 6. Future Milestones

- [ ] Procedural item generator using internal power budgets.
- [ ] AI that responds to alignment and polarity differences.
- [ ] Temporal echo re-application system.
- [ ] Player progression: skill scaling and stat growth.
- [ ] Save/load serialization and replay logging.

---

_Last updated: October 2025_
