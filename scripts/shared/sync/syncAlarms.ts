import type { AlarmsLike } from "../types";
import { ext } from "../utils/BrowserCompat";

// MV3: the browser only delivers an event that woke the service worker to listeners registered during the
// worker's first turn. Which backend this device uses is only known after an async storage read, so the one
// real onAlarm listener is registered up front and hands alarms to whoever subscribes later.

type AlarmListener = (alarm: { name: string }) => void;

const listeners = new Set<AlarmListener>();
let registered = false;

/** Call synchronously at the top level of the background script, before any await. */
export function initSyncAlarmListener(): void {
    if (registered || !ext?.alarms) return;
    registered = true;
    ext.alarms.onAlarm.addListener(alarm => {
        for (const l of listeners) l(alarm);
    });
}

/** The alarms API with onAlarm fed by the listener above. Undefined when the browser has no alarms API. */
export function backgroundAlarms(): AlarmsLike | undefined {
    const alarms = ext?.alarms;
    if (!alarms) return undefined;
    return {
        create: (name, info) => alarms.create(name, info),
        clear: name => alarms.clear(name),
        get: name => alarms.get(name),
        onAlarm: {
            addListener: cb => { listeners.add(cb); },
            removeListener: cb => { listeners.delete(cb); },
        },
    };
}
