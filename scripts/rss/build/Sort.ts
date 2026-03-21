import type { HermidataDateType, HermidataSortType } from "../../shared/types/type";
import { getElement } from "../../utils/Selection";
import { RssBuild } from "../build";

export abstract class Sort extends RssBuild {

    protected applySortToEntries(sortType: string) {
        const container = getElement('#All-RSS-entries');
        if (!container) return;

        // Always sort all entries (even hidden), to keep global order consistent
        const entries = Array.from(container.querySelectorAll<HTMLDivElement>('.RSS-entries-item'));
        if (!entries.length) return;

        const getData = (entry: HTMLDivElement) => {
            const hash = entry.className.split('TitleHash-')[1]?.replace(' seachable','');
            return this.AllHermidata[hash] || {};
        };

        const compareAlphabet = (a: HTMLDivElement, b: HTMLDivElement, reverse = false) => {
            const titleA = getData(a).title?.toLowerCase() || '';
            const titleB = getData(b).title?.toLowerCase() || '';
            return reverse ? titleB.localeCompare(titleA) : titleA.localeCompare(titleB);
        };

        const compareDate = (a: HTMLDivElement, b: HTMLDivElement, key: HermidataDateType, reverse: boolean = false) => {
            const dateA = new Date(getData(a).meta[key] || 0);
            const dateB = new Date(getData(b).meta[key] || 0);
            return reverse ? dateA.getDate() - dateB.getDate() : dateB.getDate() - dateA.getDate();
        };

        // Normalize sort type
        const reverse = sortType.startsWith("Reverse-");
        const baseType = sortType.replace("Reverse-", "");

        switch (baseType) {
            case "Alphabet":
                entries.sort((a, b) => compareAlphabet(a, b, reverse));
                break;
            case "Recently-Added":
                entries.sort((a, b) => compareDate(a, b, "added", reverse));
                break;
            case "Latest-Updates":
                entries.sort((a, b) => compareDate(a, b, "updated", reverse));
                break;
            default:
                return;
        }

        // Force DOM reflow even if order is same
        const frag = document.createDocumentFragment();
        entries.forEach(entry => frag.appendChild(entry));
        container.appendChild(frag);
    }

    protected applySortToNotification(sortType = "Latest-Updates") {
        const container = getElement('#RSS-Notification');
        if (!container) return;
        // Always sort all entries (even hidden), to keep global order consistent
        const entries = Array.from(container.querySelectorAll<HTMLDivElement>('.RSS-Notification-item'));
        if (!entries.length) return;

        const getData = (entry: HTMLDivElement) => {
            const hash = entry.className.split('TitleHash-')[1]?.replace(' seachable','');
            return this.AllHermidata[hash] || {};
        };

        const compareDate = (a: HTMLDivElement, b: HTMLDivElement, key: HermidataSortType, reverse = false) => {
            const dateA = new Date(getData(a).rss?.latestItem[key] || 0);
            const dateB = new Date(getData(b).rss?.latestItem[key] || 0);
            return reverse ? dateA.getDate() - dateB.getDate() : dateB.getDate() - dateA.getDate();
        };

        // Normalize sort type
        const reverse = sortType.startsWith("Reverse-");
        const baseType = sortType.replace("Reverse-", "");

        if (baseType === "Latest-Updates") entries.sort((a, b) => compareDate(a, b, "pubDate", reverse));
        // Force DOM reflow even if order is same
        const frag = document.createDocumentFragment();
        entries.forEach(entry => frag.appendChild(entry));
        container.appendChild(frag);
    }

    protected getYearNumber(dateInput: string): string {
        const isISOString = !!new Date(dateInput)?.getHours();
        const splitDatum = dateInput.split('/')[2]
        return isISOString ? dateInput.split('-')[0] : splitDatum || new Date()?.toISOString().split('-')[0];
    }
}