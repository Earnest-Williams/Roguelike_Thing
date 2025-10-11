# Roguelike_Thing

A modular, deterministic roguelike engine focused on composable combat, modular stats, and explicit simulation logic.  
Designed for clarity, reproducibility, and deep mechanical systems.

---

## Overview

This project implements a full-stack roguelike framework that cleanly separates simulation, content, and presentation layers.  
Every element of combat, status, and progression is data-driven and testable — no hidden randomness or ambiguous order of operations.

---

## Core Features

### ⚔️ Combat Engine
- Deterministic, rule-driven damage resolution with clear attack context objects.
- Unified handling of physical and elemental packets.
- Stackable and expiring status effects with on-tick behavior.
- Full breakdown logging for attacks and applied effects.

### ✴️ Modular Modifiers
- Every item, status, or trait can apply atomic modifiers to stats, actions, resources, or resistances.
- Folded “mod cache” built on equip/unequip ensures clean runtime data.
- Extensible definitions for new types of bonuses, penalties, and interactions.

### Combat Pipeline
1. Conversions  
2. Brands  
3. Attunement scaling  
4. Affinities  
5. Polarity (offense)  
6. Resistances and Polarity (defense)  
7. Summation and Status application

### 🧠 Actor System
- Actors maintain immutable base stats, mutable current stats, and derived modifiers.
- Real-time recalculation of status-based changes at each turn.
- Attunement and polarity systems (alignment-like properties) affect combat behavior.

### 🕒 Action and Resource Economy
- Action speed, move cost, cooldowns, and resource multipliers calculated explicitly.
- Stamina and mana regeneration controlled by both flat and percent bonuses.
- Optional “channeling” state when stationary, increasing recovery.

### 🧩 Architecture
- Modular ES structure: `/src/combat`, `/src/content`, `/js/render/`.
- Renderer-agnostic interface allowing canvas or headless modes.
- Unit and integration tests for folding logic and attack resolution.

---

## Current State

✅ **Implemented:**
- Actor, combat, status, and resource systems.  
- Deterministic attack resolution with resistances and statuses.  
- Core tests for folding and combat correctness.

🚧 **In Progress:**
- Attunement and per-turn decay loop.  
- Rendering refactor and viewport controls.  
- Expanded content set (items, enemies, spells).

🧪 **Next:**
- Debugging interface showing live combat data.  
- Dynamic content generator for procedurally assembled items.  

---

## Directory Structure

src/
├─ combat/
│ ├─ actor.js
│ ├─ attack.js
│ ├─ status.js
│ ├─ mod-folding.js
│ ├─ resources.js
│ └─ time.js
├─ content/
│ ├─ affixes.js
│ ├─ base-items.js
│ └─ status-registry.js
└─ render/
├─ canvas-renderer.js
├─ controller.js
├─ null-renderer.js
└─ presenters.js

yaml
Copy code

---

## Build and Run

**Local development:**
```bash
npm install
npm run dev
Run tests:

bash
Copy code
npm test
Serve locally:

bash
Copy code
npx serve .
Philosophy
Roguelike_Thing is designed for transparency and precision:

Every calculation is explicit.

Every modifier is visible.

Every outcome is reproducible.

It’s both a game and a framework for experimentation in tactical design — a sandbox for deterministic RPG mechanics.

