// tests/ui-combat-feedback.test.js
// Test that combat messages appear in the UI status element

import { strict as assert } from "node:assert";
import { UIManager } from "../src/ui/UIManager.js";
import { emit, EVENT } from "../src/ui/event-log.js";

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
  
  console.log("✓ Combat messages show initially");
  console.log("✓ Combat messages bypass recent system messages");
  console.log("✓ Combat messages show after system message timeout");
  console.log("✓ System messages override combat messages");
})().catch((err) => {
  console.error("UI combat feedback test failed:", err);
  process.exitCode = 1;
});
