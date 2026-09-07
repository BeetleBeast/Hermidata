// must be a self-contained IIFE bundle — no imports allowed except separated content files

import { FeedDetection } from "./feedDetection";
import { ElementPicker, type RuntimeMessage } from "./picker";

// ------------ feed detection ------------ //

const feedDetector = new FeedDetection();

feedDetector.addFeedToGlobalMain();

// ------------ element picker ------------ //


let activePicker: ElementPicker | null = null;

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg.action === "startPicking") {
        // Fresh instance each time — avoids any stale `hovered` state
        // from a previous pick/cancel leaking into the next one.
        activePicker = new ElementPicker();
        activePicker.initPicker();
    }else if (msg.action === "cancelPicking") {
        activePicker?.forceCancel(); // just calls this.cleanup()
        activePicker = null;
    }
});
