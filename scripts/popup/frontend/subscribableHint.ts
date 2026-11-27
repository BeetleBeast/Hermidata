import { setElement } from "../../shared/utils/Selection";

const HINT_LABEL = "RSS, this page has a feed you can subscribe to";

/** Marks the RSS mode button when this page has a feed to subscribe to ( the dot is only for the eye, the label is for everyone ) */
export function setSubscribableHint(isSubscribable: boolean): void {
    setElement<HTMLSpanElement>('#subscribableHint', dot => dot.hidden = !isSubscribable);
    setElement<HTMLButtonElement>('#HDRssBtn', button => {
        if (isSubscribable) {
            button.setAttribute('aria-label', HINT_LABEL);
            button.title = HINT_LABEL;
        } else {
            button.removeAttribute('aria-label');
            button.removeAttribute('title');
        }
    });
}
