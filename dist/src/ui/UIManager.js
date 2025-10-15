// src/ui/UIManager.js
// @ts-nocheck
import { EVENT, subscribe } from "./event-log.js";
/**
 * @typedef {Object} UIManagerElements
 * @property {HTMLElement | null | undefined} [status]
 * @property {HTMLElement | null | undefined} [restartButton]
 * @property {HTMLElement | null | undefined} [pauseIndicator]
 * @property {HTMLElement | null | undefined} [speedValue]
 * @property {HTMLElement | null | undefined} [equipmentSlots]
 * @property {HTMLElement | null | undefined} [inventorySlots]
 */
/**
 * @typedef {(value?: unknown) => void} Unsubscribe
 */
/**
 * Microtask scheduler used to queue DOM operations in the order they were requested.
 * Extracted so that it is evaluated once and reused for every {@link UIManager} instance.
 * @type {(cb: () => void) => void}
 */
const enqueueMicrotask = typeof queueMicrotask === "function" ? queueMicrotask : (cb) => Promise.resolve().then(cb);
/**
 * Amount of time (in milliseconds) a system level status message will block combat messages
 * from replacing it. This prevents an important message such as "You died" from being
 * immediately overwritten by combat log spam.
 */
const SYSTEM_MESSAGE_BLOCK_DURATION_MS = 250;
/**
 * Central coordinator for DOM updates based on simulation events.
 */
export class UIManager {
    /**
     * @param {{
     *   status?: HTMLElement | null,
     *   restartButton?: HTMLElement | null,
     *   pauseIndicator?: HTMLElement | null,
     *   speedValue?: HTMLElement | null,
     *   equipmentSlots?: HTMLElement | null,
     *   inventorySlots?: HTMLElement | null,
     * }} elements
     */
    constructor(elements = {}) {
        /** @type {UIManagerElements} */
        this.elements = {};
        this.setElements(elements);
        /** @type {Map<string, HTMLElement>} */
        this.equipmentSlotMap = new Map();
        /** @type {HTMLElement[]} */
        this.inventorySlotList = [];
        /** @type {"system" | "combat"} */
        this.statusPriority = "combat";
        /** @type {number} */
        this.lastSystemMessageTime = 0;
        /** @type {Promise<void>} */
        this.domTaskQueue = Promise.resolve();
        /** @type {Unsubscribe[]} */
        this.subscriptions = [
            subscribe(EVENT.STATUS, (entry) => this.handleStatusEvent(entry.payload)),
            subscribe(EVENT.COMBAT, (entry) => this.renderCombatEvent(entry.payload)),
            subscribe(EVENT.TURN, (entry) => this.updateTurnInfo(entry.payload)),
        ];
    }
    /**
     * Schedule a DOM update to run asynchronously in order.
     * @param {() => void} fn
     * @returns {Promise<void>}
     */
    scheduleDomTask(fn) {
        if (typeof fn !== "function") {
            return this.domTaskQueue;
        }
        this.domTaskQueue = this.domTaskQueue.then(() => new Promise((resolve) => {
            enqueueMicrotask(() => {
                try {
                    fn();
                }
                catch (err) {
                    if (typeof console !== "undefined" && console.error) {
                        console.error("UIManager DOM update failed", err);
                    }
                }
                finally {
                    resolve();
                }
            });
        }));
        return this.domTaskQueue;
    }
    /**
     * Clean up subscriptions if required.
     */
    destroy() {
        for (const unsub of this.subscriptions) {
            try {
                typeof unsub === "function" && unsub();
            }
            catch (err) {
                console.error("Failed to unsubscribe UI event listener", err);
            }
        }
        this.subscriptions.length = 0;
        this.equipmentSlotMap.clear();
        this.inventorySlotList.length = 0;
    }
    /**
     * Replace element references at runtime. Any keys omitted from {@link nextElements}
     * retain their previous references, which is helpful in tests when partial DOM fixtures
     * are provided.
     *
     * @param {UIManagerElements} nextElements
     */
    setElements(nextElements = {}) {
        /** @type {(keyof UIManagerElements)[]} */
        const keys = [
            "status",
            "restartButton",
            "pauseIndicator",
            "speedValue",
            "equipmentSlots",
            "inventorySlots",
        ];
        for (const key of keys) {
            if (key in nextElements) {
                this.elements[key] = nextElements[key];
            }
            else if (!(key in this.elements)) {
                this.elements[key] = undefined;
            }
        }
    }
    /**
     * Set up equipment slots based on canonical order.
     * @param {string[]} slotOrder
     * @param {(slot: string) => string} [labelForSlot]
     */
    setupEquipmentSlots(slotOrder, labelForSlot = (slot) => slot) {
        const container = this.elements.equipmentSlots;
        if (!container)
            return;
        container.innerHTML = "";
        this.equipmentSlotMap.clear();
        for (const slotName of slotOrder) {
            const slot = document.createElement("div");
            slot.classList.add("slot");
            slot.id = `equip-${slotName}`;
            slot.dataset.slot = slotName;
            const label = labelForSlot(slotName);
            slot.innerHTML = `<div class="slot-label">${label}</div><div class="slot-item"></div>`;
            container.appendChild(slot);
            this.equipmentSlotMap.set(slotName, slot);
        }
    }
    /**
     * Ensure the inventory grid contains the expected number of slots.
     * @param {number} capacity
     */
    setupInventorySlots(capacity) {
        const container = this.elements.inventorySlots;
        if (!container)
            return;
        const count = Math.max(0, Math.floor(capacity));
        container.innerHTML = "";
        this.inventorySlotList = [];
        for (let i = 0; i < count; i++) {
            const slot = document.createElement("div");
            slot.classList.add("slot");
            slot.id = `inv-${i}`;
            container.appendChild(slot);
            this.inventorySlotList.push(slot);
        }
    }
    /**
     * Render equipment based on provided accessor.
     * @param {{
     *   slotOrder: string[],
     *   getItem: (slot: string) => any,
     *   tooltipForItem?: (item: any) => string,
     * }} cfg
     */
    renderEquipment(cfg) {
        const { slotOrder, getItem, tooltipForItem } = cfg || {};
        if (!Array.isArray(slotOrder) || typeof getItem !== "function")
            return;
        for (const slotName of slotOrder) {
            const slotEl = this.equipmentSlotMap.get(slotName) || null;
            const item = getItem(slotName);
            this.updateSlotElement(slotEl, { item, emptyText: "-", clearWhenEmpty: false }, { tooltipForItem });
        }
    }
    /**
     * Render inventory stacks.
     * @param {{
     *   stacks: any[],
     *   capacity: number,
     *   tooltipForStack?: (stack: any) => string,
     * }} cfg
     */
    renderInventory(cfg) {
        const { stacks = [], capacity = stacks.length, tooltipForStack } = cfg || {};
        const count = Math.max(0, Math.floor(capacity));
        if (this.inventorySlotList.length !== count) {
            this.setupInventorySlots(count);
        }
        for (let i = 0; i < this.inventorySlotList.length; i++) {
            const slotEl = this.inventorySlotList[i];
            const stack = Array.isArray(stacks) ? stacks[i] || null : null;
            this.updateSlotElement(slotEl, { stack, emptyText: "", clearWhenEmpty: true }, { tooltipForStack });
        }
    }
    /**
     * Core DOM update helper for a slot element.
     * @param {HTMLElement | null | undefined} slotEl
     * @param {{
     *   item?: any,
     *   stack?: any,
     *   emptyText?: string,
     *   clearWhenEmpty?: boolean,
     * }} [data]
     * @param {{ tooltipForItem?: (item: any) => string, tooltipForStack?: (stack: any) => string }} [tooltips]
     */
    updateSlotElement(slotEl, data = {}, tooltips = {}) {
        if (!slotEl)
            return;
        const { item = null, stack = null, emptyText = "-", clearWhenEmpty = false } = data;
        const { tooltipForItem, tooltipForStack } = tooltips;
        const itemDiv = slotEl.querySelector(".slot-item");
        let textContent = emptyText;
        let title = "";
        if (stack) {
            const qty = stack.qty ?? stack.quantity;
            const suffix = stack.item?.stackable && qty ? ` ×${qty}` : "";
            textContent = `${stack.name ?? stack.item?.name ?? emptyText}${suffix}`;
            if (typeof tooltipForStack === "function") {
                try {
                    title = tooltipForStack(stack) || "";
                }
                catch (err) {
                    console.error("Failed to build stack tooltip", err);
                }
            }
        }
        else if (item) {
            textContent = item.name ?? emptyText;
            if (typeof tooltipForItem === "function") {
                try {
                    title = tooltipForItem(item) || "";
                }
                catch (err) {
                    console.error("Failed to build item tooltip", err);
                }
            }
        }
        if (stack || item || !clearWhenEmpty) {
            if (itemDiv) {
                itemDiv.textContent = textContent;
            }
            else {
                slotEl.innerHTML = `<div class="slot-item">${textContent}</div>`;
            }
        }
        else if (clearWhenEmpty) {
            slotEl.innerHTML = "";
        }
        if (title) {
            slotEl.title = title;
        }
        else {
            slotEl.removeAttribute("title");
        }
    }
    /**
     * Respond to combat events with a low-priority status message.
     * @param {any} payload
     */
    async renderCombatEvent(payload) {
        if (!payload)
            return;
        const who = payload.who || payload.attacker?.name || payload.attacker?.id;
        const vs = payload.vs || payload.defender?.name || payload.defender?.id;
        const dmg = typeof payload.damage === "number" ? payload.damage : payload.totalDamage;
        if (!who || !vs)
            return;
        const message = dmg != null
            ? `${who} attacks ${vs} for ${dmg} damage!`
            : `${who} attacks ${vs}!`;
        await this.setStatusMessageAsync(message, "combat", who || "combatant");
    }
    /**
     * Handle turn events (placeholder for future UI like AP readouts).
     * @param {any} _payload
     */
    updateTurnInfo(_payload) {
        // Hook reserved for future HUD details (AP, HP bars, etc.).
    }
    /**
     * Handle high-priority status events from the simulation.
     * @param {any} payload
     */
    async handleStatusEvent(payload) {
        if (!payload)
            return;
        const hasMsg = Object.prototype.hasOwnProperty.call(payload, "msg");
        const hasLegacy = Object.prototype.hasOwnProperty.call(payload, "message");
        const tasks = [];
        if (hasMsg || hasLegacy) {
            const whoField = typeof payload.who === "string" && payload.who.trim().length
                ? payload.who.trim()
                : "system";
            const message = hasMsg ? payload.msg ?? "" : payload.message ?? "";
            const priority = payload.priority ?? (whoField === "system" ? "system" : "combat");
            tasks.push(this.setStatusMessageAsync(message, priority, whoField));
        }
        if (Object.prototype.hasOwnProperty.call(payload, "restartVisible")) {
            tasks.push(this.setRestartVisibleAsync(Boolean(payload.restartVisible)));
        }
        if (Object.prototype.hasOwnProperty.call(payload, "paused")) {
            tasks.push(this.setPausedAsync(Boolean(payload.paused)));
        }
        if (Object.prototype.hasOwnProperty.call(payload, "speed")) {
            tasks.push(this.setSpeedAsync(payload.speed));
        }
        if (tasks.length) {
            await Promise.allSettled(tasks);
        }
    }
    /**
     * Update status message respecting priority rules.
     * @param {string} message
     * @param {"system" | "combat"} priority
     * @param {string} [who]
     */
    setStatusMessage(message, priority = "system", who = "system") {
        const statusEl = this.elements.status;
        if (!statusEl)
            return;
        const normalizedPriority = priority === "combat" ? "combat" : "system";
        const now = typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        if (normalizedPriority === "system") {
            this.statusPriority = "system";
            this.lastSystemMessageTime = now;
        }
        else if (normalizedPriority !== "combat" &&
            this.statusPriority === "system" &&
            now - this.lastSystemMessageTime < SYSTEM_MESSAGE_BLOCK_DURATION_MS) {
            return;
        }
        statusEl.textContent = message || "";
        if (statusEl.dataset) {
            if (who) {
                statusEl.dataset.who = String(who);
            }
            else {
                delete statusEl.dataset.who;
            }
        }
        if (normalizedPriority !== "combat") {
            this.statusPriority = "system";
        }
        else {
            this.statusPriority = "combat";
        }
    }
    /**
     * Asynchronous convenience wrapper for {@link setStatusMessage}.
     * @param {string} message
     * @param {"system" | "combat"} priority
     * @param {string} [who]
     */
    setStatusMessageAsync(message, priority = "system", who = "system") {
        return this.scheduleDomTask(() => this.setStatusMessage(message, priority, who));
    }
    /**
     * Toggle restart button visibility.
     * @param {boolean} visible
     */
    setRestartVisible(visible) {
        const btn = this.elements.restartButton;
        if (!btn)
            return;
        btn.style.display = visible ? "block" : "none";
    }
    /**
     * @param {boolean} visible
     */
    setRestartVisibleAsync(visible) {
        return this.scheduleDomTask(() => this.setRestartVisible(visible));
    }
    /**
     * Update pause indicator text.
     * @param {boolean} paused
     */
    setPaused(paused) {
        const el = this.elements.pauseIndicator;
        if (!el)
            return;
        el.textContent = paused ? "PAUSED" : "";
    }
    /**
     * @param {boolean} paused
     */
    setPausedAsync(paused) {
        return this.scheduleDomTask(() => this.setPaused(paused));
    }
    /**
     * Update displayed simulation speed.
     * @param {number|string} speed
     */
    setSpeed(speed) {
        const el = this.elements.speedValue;
        if (!el)
            return;
        const num = typeof speed === "string" ? Number(speed) : speed;
        if (Number.isFinite(num)) {
            el.textContent = `${num} tps`;
        }
        else if (speed != null) {
            el.textContent = String(speed);
        }
        else {
            el.textContent = "";
        }
    }
    /**
     * @param {number|string} speed
     */
    setSpeedAsync(speed) {
        return this.scheduleDomTask(() => this.setSpeed(speed));
    }
}
