export interface DebugEvent {
    type: string;
    [key: string]: unknown;
}
export type DebugListener = (event: DebugEvent) => void | Promise<unknown>;
export interface DebugBusApi {
    on(listener: DebugListener): () => void;
    emit(event: DebugEvent): void;
    emitAsync(event: DebugEvent): Promise<void>;
}
export declare const DebugBus: DebugBusApi;
