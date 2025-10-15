// @ts-nocheck
export type Faction = string;

export interface Resources {
  hp: number;
  mana?: number;
  stamina?: number;
  [k: string]: number | undefined;
}

export interface BaseStats {
  maxHP: number;
  baseSpeed?: number;
}

export interface ModCache {
  temporal?: {
    cooldownMult?: number;
    cooldownPerTag?: Map<string, number>;
  };
  resource?: {
    costMult?: Partial<Record<"mana" | "stamina" | "hp", number>>;
  };
}

export interface ActorLike {
  id: string;
  factions?: Faction[];
  res: Resources;
  base?: Partial<BaseStats>;
  x?: number;
  y?: number;
  modCache?: ModCache;
  statusDerived?: { canAct?: boolean };
  __turn?: number;
}

export interface GameCtx {
  turn: number;
  player: ActorLike;
  mobManager?: { list: any[] };
  FactionService?: { isHostile(a: ActorLike, b: ActorLike): boolean };
  // Movement/placement helpers used by spells & runes:
  canOccupy?(pos: { x: number; y: number }): boolean;
  addHazard?(h: HazardSpec): void;
  removeRune?(r: RuneInstance): void;
  // Optional helpers for runes:
  findNearestHostile?(
    pos: { x: number; y: number; layer?: number },
    range: number
  ): ActorLike | null;
  getActorById?(id: string): ActorLike | null;
  getVictimsForRune?(
    args: { rune: RuneInstance; actor: ActorLike }
  ): ActorLike[];
  runeAttackerProxy?: ActorLike;
}

// Forward declarations for cross-module types:
export interface HazardSpec {
  id: string;
  duration: number;
  tickEvery: number;
  prePackets?: Record<string, number>;
  statusAttempts?: StatusAttempt[];
  pos?: { x: number; y: number; layer?: number };
  source?: ActorLike;
}

export interface StatusAttempt {
  id: string;
  baseChance: number; // 0..1
  baseDuration: number; // turns
}

export interface RuneInstance {
  def: import("@runes/types").RuneDef;
  ownerId?: string | null;
  ownerFaction?: string[];
  armedAtTurn: number | null;
  chargesLeft: number;
  lastFiredTurn: number;
  detectedBy: Set<string>;
  hp: number;
  pos?: { x: number; y: number; layer?: number };
  door?: unknown;
  item?: unknown;
}
