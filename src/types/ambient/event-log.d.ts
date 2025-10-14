declare module "@ui/event-log" {
  export const EVENT: {
    SPELL_CAST: "SPELL_CAST";
    RUNE_TRIGGER: "RUNE_TRIGGER";
    // ...add others here if you want stronger typing
  };
  export function emit<T = any>(evt: string, payload: T): void;
}
