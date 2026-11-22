import type { Hermidata, ReadingQueuePriorityBand } from "../shared/types";

export interface QueueFilters {
    search: string;
    priority: ReadingQueuePriorityBand | '';
    type: string;
    site: string;
}

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
