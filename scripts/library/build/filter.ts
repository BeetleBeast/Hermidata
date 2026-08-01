import type { HermidataDateType } from "../../shared/types/index";
import { getElement } from "../../shared/utils/Selection";
import { RSSPageBuilder } from "../build";

export type AllSortsType = BasicSortsType | ReverseSortsType;

export type BasicSortsType = "Alphabetical"
    | "Rating"
    | "Author"
    | "Added"
    | "Updated"
    | "Release Date";

export type ReverseSortsType = `Reverse-${BasicSortsType}`;


export abstract class Sort extends RSSPageBuilder {


    protected amountOfYearBuckets: number = 0;
    private readonly maxYearBuckets: number = 15; 

    protected searchMode: 'all' | 'any' = 'all';

    protected applySortToEntries(sortType: AllSortsType = "Alphabetical") {
        const container = getElement('#library-entries-container');
        if (!container) return;

        // Always sort all entries (even hidden), to keep global order consistent
        const entries = Array.from(container.querySelectorAll<HTMLDivElement>('.hermidata-item'));
        if (!entries.length) return;

        const getData = (entry: HTMLDivElement) => {
            const hash = this.GetHashItem(entry);
            return this.AllHermidata[hash] || {};
        };

        const compareAlphabet = (a: HTMLDivElement, b: HTMLDivElement, reverse = false) => {
            const titleA = getData(a).title?.toLowerCase() || '';
            const titleB = getData(b).title?.toLowerCase() || '';
            return reverse ? titleB.localeCompare(titleA) : titleA.localeCompare(titleB);
        };

        const compareDate = (a: HTMLDivElement, b: HTMLDivElement, key: HermidataDateType, reverse: boolean = false) => {
            const dateA = new Date(getData(a).meta[key] || 0).getTime();
            const dateB = new Date(getData(b).meta[key] || 0).getTime();
            return reverse ? dateA - dateB : dateB - dateA;
        };
        const compareTypeAndTitle = (a: HTMLDivElement, b: HTMLDivElement, reverse: boolean = false) => {
            // Sort by type
            // and then alphabetical
            const typeA = getData(a).novelType;
            const typeB = getData(b).novelType;
            const titleA = getData(a).title?.toLowerCase() || '';
            const titleB = getData(b).title?.toLowerCase() || '';
            const positionSorterByType = reverse ? typeB.localeCompare(typeA) : typeA.localeCompare(typeB);
            const positionSortByTitle = reverse ? titleB.localeCompare(titleA) : titleA.localeCompare(titleB);
            if (positionSorterByType === 0) return positionSortByTitle;
            return positionSorterByType || positionSortByTitle;
        };
        const compareAuthor = (a: HTMLDivElement, b: HTMLDivElement, reverse: boolean = false) => {
            // const authorA = getData(a).meta?.author?.toLowerCase() || '';
            // const authorB = getData(b).meta?.author?.toLowerCase() || '';
            // return reverse ? authorB.localeCompare(authorA) : authorA.localeCompare(authorB);

            return 0; // Placeholder implementation, as author data is not available in the current implementation
        }
        const compareRating = (a: HTMLDivElement, b: HTMLDivElement, reverse: boolean = false) => {
            // const ratingA = getData(a).meta?.rating || 0;
            // const ratingB = getData(b).meta?.rating || 0;
            // return reverse ? ratingB - ratingA : ratingA - ratingB;

            return 0; // Placeholder implementation, as rating data is not available in the current implementation
        }

        // Normalize sort type
        const reverse = sortType.startsWith("Reverse-");
        const baseType = sortType.replace("Reverse-", "") as BasicSortsType;

        switch (baseType) {
            case "Alphabetical":
                entries.sort((a, b) => compareAlphabet(a, b, reverse));
                break;
            case "Added":
                entries.sort((a, b) => compareDate(a, b, "added", reverse));
                break;
            case "Updated":
                entries.sort((a, b) => compareDate(a, b, "updated", reverse));
                break;
            case "Release Date":
                entries.sort((a, b) => compareDate(a, b, "originalRelease", reverse));
                break;
            case 'Author':
                // does nothing for now, as we don't have author data in the current implementation
                entries.sort((a, b) => compareAuthor(a, b, reverse));
                break;
            case 'Rating':
                // does nothing for now, as we don't have rating data in the current implementation
                entries.sort((a, b) => compareRating(a, b, reverse));
                break;
            default:
                return;
        }

        // Force DOM reflow even if order is same
        const frag = document.createDocumentFragment();
        entries.forEach(entry => frag.appendChild(entry));
        container.appendChild(frag);

        // set label
        const label = getElement('#Sort-filter');
        if (label) label.textContent = sortType;
    }

    protected getYearNumber(dateInput: string): string {
        const isISOString = !!new Date(dateInput)?.getHours();
        const splitDatum = dateInput.split('/')[2]
        return isISOString ? dateInput.split('-')[0] : splitDatum || new Date()?.toISOString().split('-')[0];
    }
    /**
     * Converts a date (string, Date, or number) into a decade label bucket.
     * @param {string|Date|number} dateInput
     * @returns {string} decadeLabel
    */
    protected getYearBucket(dateInput: string): string {
        if (!dateInput) return "Unknown";
        const year = this.getYearNumber(dateInput)
        if (Number.isNaN(year)) return "Unknown";

        let bucket;
        
        if (this.amountOfYearBuckets >= this.maxYearBuckets) bucket = this.createDecadeBucket(year);
        else bucket = this.createYearBucket(year);
        return bucket;
    }
    private createDecadeBucket(year: string): string {

        const decade = year.slice(0, -1).concat('0s');

        return decade;
    }
    private createYearBucket(year: string): string {

        return year;
    }
    protected generateSortFilterSection() {
        const sortOptions = [
            "Alphabetical",
            "Rating",
            "Author",
            "Added",
            "Updated",
            "Release Date",
        ];

        return sortOptions;
    }
}