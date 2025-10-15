// tests/ui-combat-feedback.test.js
// Test that combat messages appear in the UI status element

import { strict as assert } from "node:assert";
import { UIManager } from "../dist/src/ui/UIManager.js";
import { CombatDebugOverlay } from "../dist/src/ui/combat-debug.js";
import { emit, EVENT } from "../dist/src/ui/event-log.js";
import { attachLogs } from "../dist/src/combat/debug-log.js";
import { makeAttackContext, recordAttackStep } from "../dist/src/combat/attack-context.js";
import { breakdownFromContext } from "../dist/src/combat/attack-breakdown.js";

function createMockStatusElement() {
  return {
    textContent: "",
    dataset: {},
    removeAttribute: function (attr) {
      if (attr === "title") {
        delete this.title;
      }
    },
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async function testCombatFeedback() {
  // Test 1: Combat messages show initially
  {
    const statusEl = createMockStatusElement();
    const uiManager = new UIManager({ status: statusEl });
    
    // Emit a combat event
    emit(EVENT.COMBAT, {
      attacker: { name: "Player", id: "player" },
      defender: { name: "Orc", id: "orc1" },
      totalDamage: 5,
    });
    
    // Wait for async processing
    await sleep(50);
    
    const success = statusEl.textContent.includes("Player") && 
                    statusEl.textContent.includes("Orc") &&
                    statusEl.textContent.includes("5");
    assert.ok(success, `Combat message should show initially. Got: "${statusEl.textContent}"`);
    
    uiManager.destroy();
  }
  
  // Test 2: Combat messages bypass recent system message block
  {
    const statusEl = createMockStatusElement();
    const uiManager = new UIManager({ status: statusEl });

    // Show a system message
    emit(EVENT.STATUS, {
      who: "system",
      msg: "Important system message",
    });
    
    await sleep(50);
    const systemMsg = statusEl.textContent;
    
    // Immediately try to show combat message (should bypass block)
    emit(EVENT.COMBAT, {
      attacker: { name: "Player", id: "player" },
      defender: { name: "Goblin", id: "goblin1" },
      totalDamage: 3,
    });

    await sleep(50);

    assert.notEqual(statusEl.textContent, systemMsg, "Combat message should replace recent system message");
    assert.ok(statusEl.textContent.includes("Goblin"), "Combat message should appear even if a system message just fired");

    uiManager.destroy();
  }

  // Test 3: Combat messages show after system message timeout
  {
    const statusEl = createMockStatusElement();
    const uiManager = new UIManager({ status: statusEl });
    
    // Show a system message
    emit(EVENT.STATUS, {
      who: "system",
      msg: "Old system message",
    });
    
    await sleep(50);
    
    // Wait for the block window to expire
    await sleep(300);
    
    // Now show combat message (should work)
    emit(EVENT.COMBAT, {
      attacker: { name: "Warrior", id: "warrior1" },
      defender: { name: "Skeleton", id: "skeleton1" },
      totalDamage: 7,
    });
    
    await sleep(50);
    
    assert.ok(statusEl.textContent.includes("Warrior"), "Combat message should show after timeout");
    assert.ok(statusEl.textContent.includes("Skeleton"), "Combat message should include defender");
    assert.ok(statusEl.textContent.includes("7"), "Combat message should include damage");
    
    uiManager.destroy();
  }

  // Test 4: System messages override combat messages
  {
    const statusEl = createMockStatusElement();
    const uiManager = new UIManager({ status: statusEl });
    
    // Show a combat message first
    emit(EVENT.COMBAT, {
      attacker: { name: "Archer", id: "archer1" },
      defender: { name: "Wolf", id: "wolf1" },
      totalDamage: 4,
    });
    
    await sleep(50);
    
    // Now show system message (should override)
    const systemMsg = "Critical system event!";
    emit(EVENT.STATUS, {
      who: "system",
      msg: systemMsg,
    });
    
    await sleep(50);
    
    assert.equal(statusEl.textContent, systemMsg, "System message should override combat message");

    uiManager.destroy();
  }

  // Test 5: Combat debug overlay renders attack breakdown
  {
    class FakeElement {
      constructor() {
        this.innerHTML = "";
        this.style = {};
      }
      remove() {}
    }

    const root = new FakeElement();
    const overlay = new CombatDebugOverlay({ root });
    overlay.show();

    const attacker = attachLogs({ id: "player", name: "Player", turn: 7, res: { hp: 20 } });
    const defender = attachLogs({ id: "goblin", name: "Goblin", turn: 7, res: { hp: 12 } });

    const ctx = makeAttackContext({
      attacker,
      defender,
      turn: 7,
      prePackets: [{ type: "slash", amount: 5 }],
      hpBefore: 12,
      hpAfter: 8,
    });
    recordAttackStep(ctx, "accuracy", [], { chance: 0.8, roll: 0.2, hit: true });
    recordAttackStep(ctx, "resists", [{ type: "slash", amount: 4 }], { resists: { slash: 0.2 } });
    ctx.statusAttempts.push({ id: "bleed", chance: 0.45 });
    ctx.appliedStatuses.push({ id: "bleed", stacks: 1, potency: 1, durationRemaining: 3 });
    ctx.hooks = { echo: { triggered: false, chance: 0.25, fraction: 0.5 } };
    ctx.totalDamage = 4;
    ctx.hpBefore = 12;
    ctx.hpAfter = 8;

    const breakdown = breakdownFromContext(ctx);

    emit(EVENT.COMBAT, {
      who: "Player",
      vs: "Goblin",
      totalDamage: 4,
      hpBefore: 12,
      hpAfter: 8,
      attackContext: ctx,
      breakdown,
      ctx: { attackKind: "melee" },
    });

    assert.ok(
      root.innerHTML.includes("accuracy"),
      "Combat debug overlay should include accuracy stage",
    );
    assert.ok(
      root.innerHTML.includes("Temporal Hooks"),
      "Combat debug overlay should list temporal hooks",
    );
    assert.ok(
      root.innerHTML.includes("Attempts"),
      "Combat debug overlay should include status attempts",
    );

    overlay.destroy();
  }

  console.log("✓ Combat messages show initially");
  console.log("✓ Combat messages bypass recent system messages");
  console.log("✓ Combat messages show after system message timeout");
  console.log("✓ System messages override combat messages");
  console.log("✓ Combat debug overlay renders attack breakdown");
})().catch((err) => {
  console.error("UI combat feedback test failed:", err);
  process.exitCode = 1;
});
