// tests/helpers/entity-utils.js
// Shared utilities for working with test entities and mob positions

export function hasValidPosition(entity) {
  return Number.isFinite(entity?.x) && Number.isFinite(entity?.y);
}

export function findEntityAtPosition(entities, x, y, { includeDead = false } = {}) {
  for (const entity of entities) {
    if (!entity) continue;
    if (!includeDead && entity.__dead) continue;
    if (hasValidPosition(entity) && entity.x === x && entity.y === y) {
      return entity;
    }
  }
  return null;
}
