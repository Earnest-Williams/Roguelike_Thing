import assert from "node:assert/strict";
import { applyStatuses } from "../dist/src/combat/status.js";

(function testBuffDurMult() {
  const atk = { modCache: { status: { buffDurMult: 1.5 } }, statuses: [] };
  const def = { modCache: { status: { buffDurMult: 1 } }, statuses: [] };
  applyStatuses(
    { statusAttempts: [{ id: "haste", baseChance: 1, baseDuration: 2 }] },
    atk,
    def,
    1,
  );
  const s = def.statuses.find((x) => x.id === "haste");
  assert(s.endsAt === 1 + Math.ceil(2 * 1.5));
})();
