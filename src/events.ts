import { EventEmitter } from "node:events";

export class EventHub extends EventEmitter {
  publish(type: string, payload: unknown) { this.emit("event", { type, payload, at: new Date().toISOString() }); }
}
