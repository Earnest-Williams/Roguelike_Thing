import { castSpell } from "@spells/engine";
export class KnowledgeBook {
    constructor() {
        this.unlocked = new Set();
    }
    unlock(id) { this.unlocked.add(id); }
    has(id) { return this.unlocked.has(id); }
    toJSON() { return Array.from(this.unlocked); }
    static from(json) { const kb = new KnowledgeBook(); json.forEach((id) => kb.unlock(id)); return kb; }
}
export class Blueprint {
    constructor(id, name, fragmentIds, def) {
        this.id = id;
        this.name = name;
        this.fragmentIds = fragmentIds;
        this.def = def;
    }
}
export function castCrafted(args) {
    return castSpell({ actor: args.actor, ctx: args.ctx, defOverride: args.blueprint.def });
}
