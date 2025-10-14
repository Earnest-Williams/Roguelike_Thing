// Ambient types to call your existing JS resolver from TS.
declare module "@combat/resolve" {
  import type { ActorLike, StatusAttempt } from "@types/core";

  export interface DamagePacket {
    type: string; // "fire" | "cold" | ... (keep open for mods)
    amount: number;
  }

  export interface ResolveArgs {
    attacker: ActorLike;
    defender: ActorLike;
    turn: number;
    packets: DamagePacket[];
    statusAttempts?: StatusAttempt[];
    tags?: string[];
  }

  export interface ResolveResult {
    totalDamage: number;
    packetsAfterDefense: DamagePacket[];
    appliedStatuses?: StatusAttempt[];
    defenderHPAfter: number;
  }

  export function resolveAttack(args: ResolveArgs): ResolveResult;
}
