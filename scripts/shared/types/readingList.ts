import type { Hermidata, ReadingQueuePriorityBand } from "./popup";
import type { HermidataModel } from "../utils/HermidataSelector";

export interface QueueFilters {
    search: string;
    priority: ReadingQueuePriorityBand | '';
    type: string;
    site: string;
}

export type QueuePosition = 'top' | 'bottom';

/** Where a row sits and what it may do */
export interface RowOptions {
    /** 0-based position in the whole queue */
    index: number;
    /** Total length of the whole queue */
    total: number;
    /** False while filters are active, so index writes stay unambiguous */
    canReorder: boolean;
    /** True while this row's handle is grabbed for keyboard reordering */
    grabbed: boolean;
}

export interface RowActions {
    open: (entry: Hermidata) => void;
    openOverview: (entry: Hermidata) => void;
    moveTo: (entry: Hermidata, index: number) => void;
    remove: (entry: Hermidata) => void;
    setPriority: (entry: Hermidata, priority: number) => void;
}

export interface PickActions {
    open: (entry: Hermidata) => void;
    again: () => void;
    close: () => void;
    /** False when the queue has only one title to pick from */
    canPickAgain: boolean;
}

/** Reading position of an entry, in chapters or episodes */
export interface QueueProgress {
    unit: 'Ch.' | 'Ep.';
    read: number;
    latest: number;
    /** 0-100; 0 when the latest chapter is unknown */
    percent: number;
}

/** A row whose handle is held for keyboard reordering */
export interface GrabbedRow {
    id: string;
    originalIndex: number;
}

/** A cover waiting to scroll into view before it is loaded */
export interface WaitingCover {
    model: HermidataModel;
    onLoad?: (url: string) => void;
}

export type QueueIconName = 'grip' | 'more' | 'external' | 'play' | 'toTop' | 'toBottom' | 'trash' | 'info' | 'close' | 'shuffle' | 'check';
