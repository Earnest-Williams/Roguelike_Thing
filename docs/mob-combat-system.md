# Mob Combat and Faction-Based Engagement

## Overview

The roguelike implements a comprehensive mob combat system where mobs actively seek out and engage hostile targets based on faction allegiance. This system creates dynamic, engaging combat encounters where:

- Mobs pursue and attack the player
- Mobs engage in combat with other mobs from different factions
- Faction logic prevents friendly fire between allied mobs
- Combat decisions are made using an AI planner with line-of-sight and distance considerations

## System Architecture

### Key Components

1. **AI Planner** (`src/combat/ai-planner.js`)
   - `selectTarget()`: Identifies hostile targets using faction checks
   - `planTurn()`: Decides between ATTACK, MOVE, GUARD, or WANDER actions
   - Prioritizes targets by line-of-sight and distance

2. **Faction Service** (`src/game/faction-service.js`)
   - `isHostile()`: Determines if two actors are hostile
   - `isAllied()`: Determines if two actors share factions
   - `relation()`: Returns -1 (hostile), 0 (neutral), or 1 (friendly)

3. **Combat Actions** (`src/combat/actions.js`)
   - `executeDecision()`: Executes planned actions
   - `tryAttackEquipped()`: Performs attacks with equipped weapons
   - `tryMove()`: Moves actors toward targets

4. **Perception System** (`src/combat/perception.js`)
   - `updatePerception()`: Builds FOV and visible actor lists
   - Provides mobs with awareness of nearby threats

5. **Monster** (`src/game/monster.js`)
   - `takeTurn()`: Orchestrates perception, planning, and action execution
   - Wraps combat actors with world position and timing

## How It Works

### Turn Execution Flow

```
Monster.takeTurn()
  ↓
1. updatePerception() - Scan environment for visible actors
  ↓
2. planTurn() - Select hostile target and decide action
  ↓
3. executeDecision() - Attack or move toward target
  ↓
4. Return delay until next action
```

### Target Selection Algorithm

```javascript
selectTarget(self, context) {
  // 1. Gather all potential targets (player + all mobs)
  const allEntities = [context.player, ...mobs];
  
  // 2. Filter out self
  const candidates = allEntities.filter(entity => entity !== self);
  
  // 3. Check perception for visible hostiles (prioritized)
  const visibleHostiles = perception.visibleActors
    .filter(actor => FactionService.relation(self, actor) < 0);
  
  // 4. Fall back to all hostiles if none visible
  const allHostiles = candidates
    .filter(actor => FactionService.relation(self, actor) < 0);
  
  // 5. Sort by line-of-sight, then distance
  // 6. Return closest hostile target
}
```

### Combat Decision Logic

```javascript
planTurn() {
  const target = selectTarget(self);
  
  if (!target) {
    return { type: "WANDER" }; // No hostiles found
  }
  
  const distance = chebyshevDistance(self, target);
  
  if (distance <= 1) {
    return { type: "ATTACK", target }; // Adjacent: attack!
  } else {
    return { type: "MOVE", target }; // Far: move closer
  }
}
```

## Faction System

### Faction IDs

- `player` - The player character
- `npc_hostile` - Hostile NPCs (orcs, bandits, etc.)
- `unaligned` - Hostile to everyone (undead, monsters)
- `neutral` - Non-hostile NPCs (unused in current content)

### Hostility Rules

1. **Allied** (same faction or shared affiliation)
   - Do NOT attack each other
   - Ignore in target selection

2. **Hostile** (different factions)
   - Attack on sight
   - Pursue when detected
   - Prioritize by distance and line-of-sight

3. **Unaligned** (special case)
   - Never allies with anyone
   - Hostile to all other factions

### Example Faction Configurations

```javascript
// Orc - Hostile to player and unaligned, allied to other npc_hostile
{
  id: "orc",
  factions: ["npc_hostile"],
  affiliations: []
}

// Skeleton - Hostile to everyone, even other skeletons
{
  id: "skeleton",
  factions: ["unaligned"],
  affiliations: []
}

// Player - Hostile to npc_hostile and unaligned
{
  id: "player",
  factions: ["player"],
  affiliations: []
}
```

## Testing

### Integration Tests

The system includes comprehensive integration tests (`tests/mob-combat-integration.test.js`):

1. ✓ Mobs detect and pursue hostile mobs from different factions
2. ✓ Mobs ignore allies in their own faction (no friendly fire)
3. ✓ Mobs detect and pursue player character
4. ✓ Mobs attack player when adjacent (in range)
5. ✓ Mobs attack hostile mobs when adjacent (mob-to-mob combat)
6. ✓ Mobs prioritize closer hostile targets
7. ✓ Complex faction scenario with multiple relationships

### Running Tests

```bash
npm test  # Runs all tests including mob combat integration
node tests/demo-mob-combat.js  # Visual demonstration of mob combat
```

## Acceptance Criteria Status

✅ **All requirements from the issue are met:**

- ✅ Mobs can detect and seek out other mobs that are not in their faction
- ✅ Mobs can detect and seek out the player character
- ✅ When encountering a valid target, mobs engage in combat
- ✅ Mobs ignore other mobs in their own faction (no friendly fire)
- ✅ AI logic supports this behavior through perception and planning systems

The system was already fully implemented and is working as specified. Tests have been added to document and verify this functionality.

## Future Enhancements

Potential improvements to consider:

1. **Diplomatic States**: Add temporary truces or faction reputation
2. **Aggro Range**: Configurable detection radius per mob type
3. **Threat Assessment**: Consider target health/equipment in prioritization
4. **Group Tactics**: Coordinate attacks between allied mobs
5. **Morale System**: Mobs flee when outmatched
6. **Pursuit Limits**: Max distance before giving up chase

## References

- AI Planner Implementation: `src/combat/ai-planner.js`
- Faction Logic: `src/game/faction-service.js`
- Combat Actions: `src/combat/actions.js`
- Mob Templates: `src/content/mobs.js`
- Integration Tests: `tests/mob-combat-integration.test.js`
