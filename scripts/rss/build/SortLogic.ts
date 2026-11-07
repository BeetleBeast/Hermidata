import type { Filters, NormalSortsType } from "../../shared/types/index";
import { getLastFilter, setLastFilter } from "../../shared/db/Storage";
import { Sort } from "./Sort";

export class SortLogic extends Sort {
    private readonly entryFilterValues = new WeakMap<HTMLDivElement, Record<string, string[]>>();

    public async sortOptionLogic(parent_section: HTMLElement): Promise<void> {
        // state object for filters
        const lastSort: Filters | undefined = await getLastFilter();
        const filters: Filters = lastSort ?? {
            include: {}, // { type: ['Manga'], status: ['Ongoing'] }
            exclude: {},
            sort: ''
        };
    
        for (const popover of parent_section.querySelectorAll<HTMLElement>(".rss-filter-dialog")) {
            popover.addEventListener("toggle", event => {
                if ((event as ToggleEvent).newState !== "open" || popover.dataset.populated) return;
                window.setTimeout(() => {
                    if (popover.matches(":popover-open") && !popover.dataset.populated) {
                        this.populateFilterPopover(popover, filters);
                    }
                }, 0);
            });
        }

        parent_section.addEventListener("click", event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const item = target.closest<HTMLElement>(".filter-item-list");
            const checkbox = item?.querySelector<HTMLDivElement>(".custom-checkbox");
            if (checkbox) this.eventOnClick(checkbox, filters);
        });

        for (const section of parent_section.querySelectorAll<HTMLElement>(".filter-section")) {
            this.updateFilterButton(section, filters);
        }
        const hasAnyFilters = (filters: Filters) => {
            return (
                Object.values(filters.include || {}).some(v => v.length > 0) ||
                Object.values(filters.exclude || {}).some(v => v.length > 0) ||
                !!filters.sort
            );
        }
    
        // Apply saved filters after the RSS entries and filter controls are in the DOM.
        if (hasAnyFilters(filters)) {
            this.applyFilterToEntries(filters);
            if (filters.sort) {
                this.applySortToEntries(filters.sort);
                this.applySortToNotification()
            }
        }
    
    }

    private populateFilterPopover(popover: HTMLElement, filters: Filters): void {
        const list = popover.querySelector<HTMLDivElement>(".rss-filter-list");
        const section = popover.closest<HTMLElement>(".filter-section");
        const title = section?.querySelector(".filter-header-text")?.textContent?.trim();
        if (!list || !title) return;

        const items: string[] = JSON.parse(list.dataset.filterItems || "[]");
        const appendItems = () => {
            const start = Number(list.dataset.nextItemIndex || "0");
            const end = Math.min(start + 80, items.length);
            const fragment = document.createDocumentFragment();
            for (const value of items.slice(start, end)) {
                const item = document.createElement("div");
                item.className = "filter-item-list";

                const checkbox = document.createElement("div");
                checkbox.className = "filter-item-checkbox custom-checkbox";
                checkbox.dataset.state = this.getFilterState(title, value, filters);

                const label = document.createElement("span");
                label.className = "filter-item-label";
                label.textContent = value;

                item.append(checkbox, label);
                fragment.appendChild(item);
            }
            list.appendChild(fragment);
            list.dataset.nextItemIndex = String(end);
        };

        appendItems();
        list.addEventListener("scroll", () => {
            const nextIndex = Number(list.dataset.nextItemIndex || "0");
            if (nextIndex < items.length && list.scrollTop + list.clientHeight >= list.scrollHeight - 120) {
                appendItems();
            }
        });
        popover.dataset.populated = "true";
    }

    private getFilterState(section: string, label: string, filters: Filters): string {
        if (section === "Sort") {
            if (filters.sort === label) return "1";
            if (filters.sort === `Reverse-${label}`) return "2";
            return "0";
        }
        if (filters.include[section]?.includes(label)) return "1";
        if (filters.exclude[section]?.includes(label)) return "2";
        return "0";
    }

    private eventOnClick(cb: HTMLDivElement, filters: Filters) {
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
            const sortCheckboxes = cb.closest(".filter-section")?.querySelectorAll<HTMLDivElement>(".custom-checkbox");
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
            setLastFilter(filters);
            if (filters.sort) {
                this.applySortToEntries(filters.sort);
                this.applySortToNotification();
            }
            const filterSection = cb.closest<HTMLElement>(".filter-section");
            if (filterSection) this.updateFilterButton(filterSection, filters);
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
        const filterSection = cb.closest<HTMLElement>(".filter-section");
        if (filterSection) this.updateFilterButton(filterSection, filters);
        // trigger filtering logic here
        this.applyFilterToEntries(filters);
        setLastFilter(filters);
    };

    private updateFilterButton(section: HTMLElement, filters: Filters): void {
        const title = section.querySelector(".filter-header-text")?.textContent?.trim();
        const button = section.querySelector<HTMLButtonElement>(".filter-button");
        if (!title || !button) return;

        if (title === "Sort") {
            button.textContent = filters.sort || "Alphabet";
            return;
        }

        const selected = new Set([
            ...(filters.include[title] || []),
            ...(filters.exclude[title] || [])
        ]);
        const optionCount = button.dataset.optionCount;
        button.textContent = selected.size
            ? `${selected.size} of ${optionCount}`
            : `Any · ${optionCount}`;
    }

    private applyFilterToEntries(filters: Filters) {
        const entries = document.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-is-notification-item="false"]`);
        const include = Object.entries(filters.include)
            .filter(([, values]) => values.length > 0)
            .map(([section, values]) => [section, new Set(values)] as const);
        const exclude = Object.entries(filters.exclude)
            .filter(([, values]) => values.length > 0)
            .map(([section, values]) => [section, new Set(values)] as const);

        for (const entry of entries) {
            const values = this.getEntryFilterValues(entry);
            const included = include.every(([section, selected]) => values[section]?.some(value => selected.has(value)) ?? false);
            const excluded = exclude.some(([section, selected]) => values[section]?.some(value => selected.has(value)));
            const visible = included && !excluded;
            entry.style.display = visible ? "" : "none";
            entry.dataset.searchable = visible ? "true" : "false";
        }
    }

    private getEntryFilterValues(entry: HTMLDivElement): Record<string, string[]> {
        const cached = this.entryFilterValues.get(entry);
        if (cached) return cached;

        const hashItem = this.GetHashItem(entry);
        const entryData = this.AllHermidata[hashItem];
        const values: Record<string, string[]> = {
            Type: [entryData.novelType],
            "Read-Status": [entryData.chapter.bookmarks[entryData.chapter.bookmarkInUse].readStatus],
            "Novel-Status": [entryData.meta?.novelStatus].filter((value): value is string => Boolean(value)),
            Source: Array.from(new Set([entryData.source, ...(entryData.meta.altSources || [])].filter(Boolean))),
            Tag: entryData.meta.tags || [],
            Date: [this.getYearBucket(entryData.meta.added)]
        };
        this.entryFilterValues.set(entry, values);
        return values;
    }
}