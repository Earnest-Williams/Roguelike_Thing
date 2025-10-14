# Mob Combat Integration Tests

This directory contains comprehensive tests for the mob combat and faction-based engagement system.

## Quick Start

Run all tests:
```bash
npm test
```

Run just the mob combat integration tests:
```bash
node tests/mob-combat-integration.test.js
```

Run the visual demonstration:
```bash
node tests/demo-mob-combat.js
```

## Test Files

### `mob-combat-integration.test.js`
Comprehensive integration tests covering all acceptance criteria:
- Mob-to-mob combat with different factions
- Mob-to-player combat
- Friendly fire prevention
- Target prioritization
- Complex multi-faction scenarios

**7 tests, all passing ✅**

### `demo-mob-combat.js`
Interactive ASCII visualization demonstrating:
- Mobs pursuing the player from both sides
- Allied mobs moving together without attacking each other
- Hostile mobs (skeleton) attacking everyone
- Real-time combat decisions

**Example output:**
```
═══ TURN 1 ═══
======================
|...o......@......s...|
======================
  → Orc moved toward hostile target
  → Skeleton moved toward hostile target
```

### `ai-wireup.test.js`
Existing tests for AI behavior:
- Monster wandering within leash
- Approaching visible hostiles
- Guard position behavior

## Test Coverage

The mob combat system is fully covered by tests:

| Feature | Test Coverage |
|---------|--------------|
| Mob detects hostile mobs | ✅ Tested |
| Mob detects player | ✅ Tested |
| Mob attacks adjacent targets | ✅ Tested |
| Mob moves toward distant targets | ✅ Tested |
| Faction prevents friendly fire | ✅ Tested |
| Target prioritization | ✅ Tested |
| Multi-faction scenarios | ✅ Tested |

## Documentation

See `docs/mob-combat-system.md` for complete system documentation including:
- Architecture overview
- Algorithms and decision logic
- Faction system rules
- Future enhancements

## Acceptance Criteria

All requirements from the issue are met and tested:

✅ Mobs can detect and seek out other mobs that are not in their faction  
✅ Mobs can detect and seek out the player character  
✅ When encountering a valid target, mobs engage in combat  
✅ Mobs ignore other mobs in their own faction  
✅ AI logic supports this behavior

## System Components Tested

- **AI Planner** (`src/combat/ai-planner.js`)
  - Target selection
  - Decision planning
  - Prioritization logic

- **Faction Service** (`src/game/faction-service.js`)
  - Hostility determination
  - Alliance checking
  - Relation scoring

- **Combat Actions** (`src/combat/actions.js`)
  - Attack execution
  - Movement toward targets
  - Decision execution

- **Perception** (`src/combat/perception.js`)
  - FOV calculation
  - Visible actor detection

- **Monster** (`src/game/monster.js`)
  - Turn orchestration
  - Perception updates
  - Action execution

## Running Individual Tests

Each test can be run independently:

```bash
# All integration tests
node tests/mob-combat-integration.test.js

# Visual demo
node tests/demo-mob-combat.js

# AI wireup tests
node tests/ai-wireup.test.js

# Faction service tests
node tests/faction-service.test.js
```

## Test Results

All tests pass successfully:
```
✓ mobs detect and pursue hostile mobs from different factions
✓ mobs ignore allies in their own faction (no friendly fire)
✓ mobs detect and pursue player character
✓ mobs attack player when adjacent (in range)
✓ mobs attack hostile mobs when adjacent (mob-to-mob combat)
✓ mobs prioritize closer hostile targets
✓ complex faction scenario: mobs respect multiple faction relationships
```

## Contributing

When adding new mob behavior:
1. Add tests to `mob-combat-integration.test.js`
2. Update the demo in `demo-mob-combat.js` if needed
3. Update `docs/mob-combat-system.md` documentation
4. Ensure all tests pass with `npm test`
