/** Types of the item detail ( Overview ) page, where every field is edited in place and saved on change */

export interface CommitOptions {
    /** Offer an Undo in the toast. Off for free text ( notes ), where the field's own undo is enough */
    undoable: boolean;
}

/**
 * Applies a change to the shown item, saves it and reports it; changes run one after another. Resolves to whether it was saved.
 * The change may be async ( a link also writes the other item ), and runs in turn like every other change
 */
export type CommitChange = (message: string, change: () => void | Promise<void>, options?: Partial<CommitOptions>) => Promise<boolean>;

export type SaveState = 'saving' | 'saved' | 'failed';

export interface ChipListOptions {
    /** Accessible name of the list, used in the add and remove buttons */
    itemName: string;
    /** Values that are shown without a remove button */
    isLocked?: (value: string) => boolean;
    onChange: (values: string[]) => void;
}

export interface TagPickerOptions {
    /** Accessible name of the field, e.g. "genre" */
    itemName: string;
    /** Every tag that can be picked */
    available: () => string[];
    onChange: (tags: string[]) => void;
}

/** An image picked as the new cover, before it is cropped */
export interface CoverSource {
    blob: Blob;
    /** The link it came from; kept so the cover still points at its source after cropping. Null for uploads */
    url: string | null;
}

export type MarkerSortKey = 'chapter' | 'date' | 'lastUsed';
export type SortDirection = 'asc' | 'desc';
