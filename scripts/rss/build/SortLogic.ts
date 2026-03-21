import type { Filters, NormalSortsType } from "../../shared/types/rssBuildType";
import { getLastFilter, setLastFilter, setLastSortOption } from "../../shared/types/Storage";
import { Sort } from "./Sort";

export class SortLogic extends Sort {

    public async sortOptionLogic(parent_section: HTMLElement): Promise<void> {
        // state object for filters
        const lastSort: Filters | undefined = await getLastFilter();
        const filters: Filters = lastSort ?? {
            include: {}, // { type: ['Manga'], status: ['Ongoing'] }
            exclude: {},
            sort: ''
        };
    
        // find all custom checkboxes
        const checkboxes = parent_section.querySelectorAll<HTMLInputElement>(".custom-checkbox");
    
        for (const cb of checkboxes) {
            cb.removeEventListener("click", () => this.eventOnClick(cb, filters));
            cb.addEventListener("click", () => this.eventOnClick(cb, filters));
        };
        const makeActiveState = (cb: HTMLInputElement) => {
            const label = cb.nextElementSibling?.textContent?.trim();
            const section = cb.closest(".filter-section")?.firstChild?.textContent?.trim();
            let state = 0;
    
            if (!label || !section) return state;
    
            const includeSelection = filters?.include?.[section] || [];
            const excludeSelection = filters?.exclude?.[section] || [];
            if ( includeSelection.length === 0 && excludeSelection.length === 0 && filters?.sort === undefined) return state;
            
            if ( includeSelection.includes(label) ) state = 1;
            else if ( excludeSelection.includes(label) ) state = 2;
            else if ( filters?.sort === label ) state = 1;
            return state;
        }
        // apply filters from local storage Visually
        for (const cb of checkboxes) {
            cb.dataset.state = String(makeActiveState(cb));
        };
        const hasAnyFilters = (filters: Filters) => {
            return (
                Object.values(filters.include || {}).some(v => v.length > 0) ||
                Object.values(filters.exclude || {}).some(v => v.length > 0) ||
                !!filters.sort
            );
        }
    
        // apply filters from local storage Logically
        setTimeout(() => {
            if (hasAnyFilters(filters)) {
                this.applyFilterToEntries(filters);
                if (filters.sort) {
                    this.applySortToEntries(filters.sort);
                    this.applySortToNotification()
                }
            }
        }, 300);
    
    }

    private eventOnClick(cb: HTMLInputElement, filters: Filters) {
        let state = Number.parseInt(cb.dataset.state || "0");

        // cycle 0→1→2→0
        state = (state + 1 ) % 3;
        cb.dataset.state = state.toString();

        // find its label text (filter name)
        const label = cb.nextElementSibling?.textContent?.trim();
        // find which section it belongs to (Type, Status, etc.)
        const section = cb.closest(".filter-section")?.firstChild?.textContent?.trim();
        if (!label || !section) return;

        if (section === "Sort") {
            // Reset all sort checkboxes first
            filters.sort = ''
            const sortCheckboxes = cb.closest(".filter-section")?.querySelectorAll<HTMLInputElement>(".custom-checkbox");
            if (!sortCheckboxes) return
            for (const otherCb of sortCheckboxes) otherCb.dataset.state = "0";

            // Enable current one
            if (state === 1) {
                cb.dataset.state = "1" 
                filters.sort = label as NormalSortsType;
            } else if (state === 2) {
                cb.dataset.state = "2";
                filters.sort = `Reverse-${label as NormalSortsType}`
            }

            // apply and persist
            if (filters.sort) {
                setLastSortOption(filters.sort);
                this.applySortToEntries(filters.sort);
                this.applySortToNotification();
            }
            return;
        }

        // init arrays if not exist
        if (!filters.include[section]) filters.include[section] = [];
        if (!filters.exclude[section]) filters.exclude[section] = [];

        // reset previous state
        filters.include[section] = filters.include[section].filter(v => v !== label);
        filters.exclude[section] = filters.exclude[section].filter(v => v !== label);

        // apply new state
        if (state === 1) filters.include[section].push(label);
        else if (state === 2) filters.exclude[section].push(label);
        // trigger filtering logic here
        this.applyFilterToEntries(filters);
        setLastFilter(filters);
    };

    private applyFilterToEntries(filters: Filters) {
        const entries = document.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-is-notification-item="false"]`);

        for (const entry of entries) {
            this.applyInividualFilterToEntries(entry, filters);
        }
    }

    private applyInividualFilterToEntries(entry: HTMLDivElement, filters: Filters): void {
        const hashItem = this.GetHashItem(entry);
        const entryData = this.AllHermidata[hashItem];
        const Type = entryData.type;
        const Status = entryData.status;
        const Source = entryData.source;
        const Tag = entryData.meta.tags || "";
        const DateFilter = this.getYearBucket(entryData.meta.added);

        const inputs = [Type, Status, Source, Tag, DateFilter];


        let visible = true;

        // Check all include filters — must match at least one in each group
        visible = this.matchingFilter(filters, inputs, 'include');

        // Check exclude filters — hide if matches any
        if (visible) {
            visible = this.matchingFilter(filters, inputs, 'exclude');
        }

        entry.style.display = visible ? "" : "none";
        entry.dataset.seachable = visible ? 'true' : 'false';
    };

    private matchingFilter(filters: Filters, inputs: (string | string[])[], filterType: 'include' | 'exclude'): boolean {
        const isInclude = filterType === 'include';
        const loopEntries = isInclude ? filters.include : filters.exclude;

        let visible = true;

        for (const [, values] of Object.entries(loopEntries)) {
            if (values.length === 0) continue;

                    
            const val = this.setState(values, inputs) ?? 'none'; // error here
            
            const match = Array.isArray(val)
                ? val.some(v => values.includes(v))
                : values.includes(val);

            if ((!match && isInclude) ||( match && !isInclude)) {
                visible = false;
                break;
            }
        }
        return visible
    }
    private setState(values: string[], input: (string | string[])[] ): string | void {
        for (const value of values) { // value is the filter value
            for (const type of input) {
                if (value === type) {
                    return type
                } else if (Array.isArray(type) && type.includes(value)) {
                    return type[type.indexOf(value)];
                }
            }
        }
    }
}