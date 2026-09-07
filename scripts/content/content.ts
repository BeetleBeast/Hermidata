// must be a self-contained IIFE bundle — no imports allowed except separated content files

import { FeedDetection } from "./feedDetection";
import { ElementPicker, type RuntimeMessage } from "./picker";
import { PickerFeedbackController } from "./pickerFeedback";

// ------------ feed detection ------------ //

const feedDetector = new FeedDetection();

feedDetector.addFeedToGlobalMain();

// ------------ element picker ------------ //


let activePicker: ElementPicker | null = null;
let activeFeedback: PickerFeedbackController | null = null;

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg.action === "startPicking") {

        activePicker = new ElementPicker();
        activePicker.initPicker();
        activeFeedback = new PickerFeedbackController(activePicker)

    }else if (msg.action === "cancelPicking") {
        activePicker?.forceCancel();
        activeFeedback?.forceDestroy();
        activePicker = null;
        activeFeedback = null;
    }
});
