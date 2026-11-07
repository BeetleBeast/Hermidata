import type { Filters, NormalSortsType } from "../../shared/types/index";
import { getLastFilter, setLastFilter } from "../../shared/db/Storage";
import { Sort } from "./Sort";

type RSSFilterOptionList = HTMLDivElement & { filterItems?: string[] };

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
    
        // Keep setup steps separate: large menus render after opening; small menus are ready immediately.
        this.attachPopoverListeners(parent_section, filters);
        this.populateSmallFilterPopovers(parent_section, filters);
        this.attachFilterOptionListener(parent_section, filters);

        // Restore the compact button labels independently of when each menu's options are rendered.
        for (const section of parent_section.querySelectorAll<HTMLElement>(".filter-section")) {
            this.updateFilterButton(section, filters);
        }

        this.applySavedFilters(filters);
    }

    private attachPopoverListeners(parentSection: HTMLElement, filters: Filters): void {
        const popovers = parentSection.querySelectorAll<HTMLElement>(".rss-filter-dialog");
        for (const popover of popovers) {
            popover.addEventListener("toggle", event => this.handlePopoverToggle(popover, event, filters));
        }
    }

    private populateSmallFilterPopovers(parentSection: HTMLElement, filters: Filters): void {
        const popovers = parentSection.querySelectorAll<HTMLElement>(".rss-filter-dialog");
        for (const popover of popovers) {
            const list = popover.querySelector<RSSFilterOptionList>(".rss-filter-list");
            if (list?.filterItems && list.filterItems.length <= 36) {
                this.populateFilterPopover(popover, filters);
            }
        }
    }

    private attachFilterOptionListener(parentSection: HTMLElement, filters: Filters): void {
        // A single delegated listener also handles options appended later while scrolling.
        parentSection.addEventListener("click", event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const item = target.closest<HTMLElement>(".filter-item-list");
            const checkbox = item?.querySelector<HTMLDivElement>(".custom-checkbox");
            if (checkbox) this.eventOnClick(checkbox, filters);
        });
    }

    private handlePopoverToggle(popover: HTMLElement, event: Event, filters: Filters): void {
        if ((event as ToggleEvent).newState !== "open" || popover.dataset.populated) return;

        // Yield one task so Chrome can paint the native popover before a large menu is built.
        window.setTimeout(() => {
            if (popover.matches(":popover-open") && !popover.dataset.populated) {
                this.populateFilterPopover(popover, filters);
            }
        }, 0);
    }

    private applySavedFilters(filters: Filters): void {
        const hasFilters = Object.values(filters.include || {}).some(values => values.length > 0)
            || Object.values(filters.exclude || {}).some(values => values.length > 0)
            || Boolean(filters.sort);
        if (!hasFilters) {
            this.updateEmptyState();
            return;
        }

        this.applyFilterToEntries(filters);
        if (!filters.sort) return;

        this.applySortToEntries(filters.sort);
        this.applySortToNotification();
    }

    private populateFilterPopover(popover: HTMLElement, filters: Filters): void {
        const list = popover.querySelector<HTMLDivElement>(".rss-filter-list");
        const section = popover.closest<HTMLElement>(".filter-section");
        const title = section?.querySelector(".filter-header-text")?.textContent?.trim();
        if (!list || !title) return;

        const items = (list as RSSFilterOptionList).filterItems;
        if (!items) throw new Error("RSS filter options were not attached to the list");
        this.appendFilterOptions(list, items, title, filters);
        list.addEventListener("scroll", () => this.handleFilterListScroll(list, items, title, filters));
        popover.dataset.populated = "true";
    }

    private appendFilterOptions(list: HTMLDivElement, items: string[], title: string, filters: Filters): void {
        const start = Number(list.dataset.nextItemIndex || "0");
        const end = Math.min(start + 36, items.length);
        const fragment = document.createDocumentFragment();
        const checkboxes: HTMLDivElement[] = [];

        for (let index = start; index < end; index++) {
            const item = document.createElement("div");
            item.className = "filter-item-list";

            const checkbox = document.createElement("div");
            checkbox.className = "filter-item-checkbox custom-checkbox";
            checkbox.dataset.state = "0";
            checkboxes.push(checkbox);

            const label = document.createElement("span");
            label.className = "filter-item-label";
            label.textContent = items[index];

            item.append(checkbox, label);
            fragment.appendChild(item);
        }

        // Append the batch in one DOM write, then restore saved include/exclude states.
        list.appendChild(fragment);
        for (let index = 0; index < checkboxes.length; index++) {
            checkboxes[index].dataset.state = this.getFilterState(title, items[start + index], filters);
        }
        list.dataset.nextItemIndex = String(end);
    }

    private handleFilterListScroll(list: HTMLDivElement, items: string[], title: string, filters: Filters): void {
        const nextIndex = Number(list.dataset.nextItemIndex || "0");
        const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 120;
        // Add another small batch only when the user approaches the end of the current list.
        if (nextIndex < items.length && nearBottom) {
            this.appendFilterOptions(list, items, title, filters);
        }
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

        this.updateEmptyState();
    }

    private updateEmptyState(): void {
        const container = document.querySelector<HTMLElement>("#All-RSS-entries");
        if (!container) return;

        let emptyMessage = container.querySelector<HTMLParagraphElement>(":scope > .empty-list-message");
        if (!emptyMessage) {
            emptyMessage = document.createElement("p");
            emptyMessage.className = "empty-list-message";
            emptyMessage.textContent = "No items";
            emptyMessage.setAttribute("role", "status");
            emptyMessage.setAttribute("aria-live", "polite");
            container.appendChild(emptyMessage);
        }

        const hasVisibleEntries = Array.from(
            container.querySelectorAll<HTMLDivElement>('.hermidata-item[data-is-notification-item="false"]')
        ).some(entry => entry.style.display !== "none");
        emptyMessage.hidden = hasVisibleEntries;
    }

    private getEntryFilterValues(entry: HTMLDivElement): Record<string, string[]> {
        const cached = this.entryFilterValues.get(entry);
        if (cached) return cached;

        // Entry metadata is stable for the lifetime of these RSS card nodes.
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