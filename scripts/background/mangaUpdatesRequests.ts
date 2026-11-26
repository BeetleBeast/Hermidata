import { ext } from "../shared/utils/BrowserCompat";
import { logConsoleError } from "../shared/utils/ErrorMessage";

/*
api.mangaupdates.com answers 403 to any request carrying an extension Origin ( chrome-extension://… ),
and the browser adds one to every request the background makes. This rule takes the Origin off
Hermidata's own requests to that API, nothing else: pages on mangaupdates.com keep theirs.
Session rules last until the browser closes, so the background adds it again on every start.
*/

const RULE_ID = 1;
const MANGAUPDATES_API = 'api.mangaupdates.com';

/** Adds ( or replaces ) the rule; never throws, the rest of the startup goes on without it */
export async function allowMangaUpdatesRequests(): Promise<void> {
    const dnr = ext.declarativeNetRequest;
    if (!dnr?.updateSessionRules) {
        console.warn('[Hermidata] declarativeNetRequest is not available: MangaUpdates requests will be refused');
        return;
    }
    try {
        await dnr.updateSessionRules({
            removeRuleIds: [RULE_ID],
            addRules: [{
                id: RULE_ID,
                priority: 1,
                action: {
                    type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
                    requestHeaders: [{ header: 'origin', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation }],
                },
                condition: {
                    requestDomains: [MANGAUPDATES_API],
                    // only requests this extension starts ( its host is the id in Chrome, a uuid in Firefox )
                    initiatorDomains: [new URL(ext.runtime.getURL('')).hostname],
                    resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType, 'other' as chrome.declarativeNetRequest.ResourceType],
                },
            }],
        });
    } catch (error) {
        logConsoleError('[Hermidata] could not add the MangaUpdates request rule:', error);
    }
}
