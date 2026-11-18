import type { SeparateProminence, SeparateProminenceState } from "../../shared/types/index";

/** Picks how prominent "Save as separate item" is ( see SeparateProminence ) */
export function getSeparateProminence(state: SeparateProminenceState): SeparateProminence {
    if (!state.hasSameTitled) return 'hidden';
    if (state.declinedAll) return 'primary'; // a plain Save would write into whichever saved item has this type
    if (state.typeChanged) return 'visible'; // a different type may be an adaptation, or a correction: both stay clear
    if (state.exactMatch) return 'subtle';
    return 'visible';
}
