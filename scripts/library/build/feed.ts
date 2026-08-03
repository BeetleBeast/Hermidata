import type { Hermidata, Settings } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getElement, setElement } from "../../shared/utils/Selection";
import { RSSPageBuilder } from "../build";

export class feed extends RSSPageBuilder {

    private readonly AllHermidataContainer: HTMLDivElement | null = document.querySelector('#library-entries-container');

    public viewMode: 'grid' | 'list' = 'list';
    
    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        super(allHermidata, settings);
    }


    public build(): Promise<void> {
        this.buildFeedAll();

        this.setCheckBoxAtCorrectState();
        return Promise.resolve();
    }
    public reload(): void {
        
    }
    private setCheckBoxAtCorrectState() {
        const visibleElements = this.AllHermidataContainer?.querySelectorAll<HTMLDivElement>('div[aria-hidden="false"]');
        if (!visibleElements) return;

        const updates: { checkbox: HTMLInputElement; position: number }[] = [];

        const translationPosition = () => this.viewMode === 'list' ? -20 : 10;

        const setWith = (siteWidth: number) => this.viewMode === 'grid' ? 0 : -(150 - siteWidth);

        // READ phase — no writes here
        for (const el of visibleElements) {
            const site = this.viewMode === 'grid' ? el.querySelector<HTMLImageElement>('.hermidata-item-image') : el.querySelector<HTMLDivElement>('.hermidata-item-site');
            const checkbox = el.querySelector<HTMLInputElement>('.hermidata-item-checkbox-invisible-container');
            if (!site || !checkbox) continue;

            const siteWidth = site.getBoundingClientRect().width;
            updates.push({ checkbox, position: setWith(siteWidth) });
        }

        // WRITE phase — no reads here
        for (const { checkbox, position } of updates) {
            checkbox.style.opacity = '0';
            checkbox.style.transform = `translateX(${translationPosition()}px)`;
            checkbox.style.left = `${position}px`;
        }
    }

    public setGridViewMode(newViewMode: 'grid' | 'list'): void {
        const buttons = document.querySelectorAll<HTMLButtonElement>('.viewMode-toggle');
        const currentButtonSelected = document.querySelector<HTMLButtonElement>(newViewMode === 'list' ? "#library-entries-ViewMode-list" : "#library-entries-ViewMode-grid");

        if (!currentButtonSelected) return;
        
        // toggle button
        buttons.forEach(button => {
            if (button !== currentButtonSelected) {
                button.ariaPressed = 'false';
                button.dataset.active_view_mode = 'false';
            } else {
                button.ariaPressed = 'true';
                button.dataset.active_view_mode = 'true';
            }
        });
        this.viewMode = newViewMode;

        document.body.dataset.listMode = this.viewMode === 'list' ? 'true' : 'false';

        this.setCheckBoxAtCorrectState();
    }

    private buildFeedAll() {
        // get all entries that are filtered
        const allEntries = this.AllHermidata; // TODO: implement this when filtering is implemented

        const docFragment = document.createDocumentFragment();

        for (const entry of Object.values(allEntries)) {
            docFragment.appendChild(this.buildEntry(new HermidataModel(entry)));
        }

        this.AllHermidataContainer?.replaceChildren(docFragment);

    }
    private buildEntry(entry: HermidataModel): HTMLDivElement {
        // item container
        const container = this.buildEntryContainer(entry);
        
        // site
        const site = this.buildSite(entry);

        // image
        const img = this.buildImage(entry);
        
        // novel Type
        const novelType = this.buildNovelType(entry);

        // title
        const title = this.buildTitle(entry);

        // chapter
        const chapter = this.buildChapter(entry);

        // date
        const date = this.buildDate(entry);

        // checkMark
        const checkbox = this.buildCheckbox();

        // append
        container.append(site, img, novelType, title, chapter, date, checkbox);

        // return
        return container;
    }
    private buildEntryContainer(entry: Hermidata): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'hermidata-item';
        container.dataset.id = entry.id;
        container.dataset.viewMode = this.viewMode;
        container.ariaHidden = 'false';

        container.addEventListener('click', () => open('./Hermidata.html#/id/' + entry.id));
        container.addEventListener('mouseover', (e) => this.transformCheckboxPosition(e, 'show'));
        container.addEventListener('mouseout', (e) => this.transformCheckboxPosition(e, 'hide'));

        return container;
    }
    private transformCheckboxPosition(event: MouseEvent, entry: 'show' | 'hide') {
        const container = event.currentTarget as HTMLDivElement;
        const checkbox = container.querySelector<HTMLInputElement>('.hermidata-item-checkbox-invisible-container');
        if (!checkbox) return;

        const isListMode = this.viewMode === 'list';

        const normal = () => (entry === 'show') ? '0px' : '-20px';
        const reverse = () => (entry === 'show') ? '-20px' : '10px';

        const value = isListMode ? normal() : reverse();



        checkbox.style.opacity = `${entry === 'show' ? '1' : '0'}`;

        checkbox.style.transform = `translateX(${value})`;
    }

    private buildImage(entry: Hermidata): HTMLImageElement {
        const img = document.createElement('img');

        img.className = "hermidata-item-image"
        img.src = entry?.rss?.image ?? '../../../assets/icon/icon48.png';

        img.loading = "lazy";
        img.sizes = "150x190";
        img.alt = `${entry?.rss?.latestItem.title} Image`;

        return img;
    }
    private buildTitle(entry: Hermidata): HTMLDivElement {
        const title = document.createElement('div');
        title.className = "hermidata-item-title";

        title.textContent = entry.title;

        return title;
    }
    private buildSite(entry: Hermidata): HTMLDivElement {

        const siteContainer = document.createElement('div');
        siteContainer.className = "hermidata-item-site-container";

        const site = document.createElement('div');
        site.className = "hermidata-item-site";

        site.textContent = entry.meta.altSources.join(', ') || entry.source;

        siteContainer.appendChild(site);

        return siteContainer;
    }
    private buildChapter(entry: HermidataModel): HTMLDivElement {
        const chapter = document.createElement('div');
        chapter.className = "hermidata-item-chapter";

        chapter.textContent = `Ch. ${entry.GetLatestReadChapter()}`;

        return chapter;
    }
    private buildDate(entry: HermidataModel): HTMLDivElement {
        const date = document.createElement('div');
        date.className = "hermidata-item-date";

        const unixTime = entry.rss?.lastFetched ? new Date(entry.rss?.lastFetched).getTime() : new Date(entry.meta.updated).getTime();
        const today = new Date().getTime();

        const isHoursAgo = Math.floor((today - unixTime) / 1000 / 60 / 60) < 24;
        const isDaysAgo = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24) < 7;
        const isWeeksAgo = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7) < 4;
        const isMonthsAgo = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4) < 12;
        const isYearsAgo = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12) < 5;
        const isDecadesAgo = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12 / 5) < 10;
        const isCenturiesAgo = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12 / 5 / 10) < 100;

        if (isHoursAgo) {
            date.textContent = `${Math.floor((today - unixTime) / 1000 / 60 / 60)}h ago`;
        }
        else if (isDaysAgo) {
            date.textContent = `${Math.floor((today - unixTime) / 1000 / 60 / 60 / 24)}d ago`;
        }
        else if (isWeeksAgo) {
            date.textContent = `${Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7)}w ago`;
        }
        else if (isMonthsAgo) {
            date.textContent = `${Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4)}m ago`;
        }
        else if (isYearsAgo) {
            date.textContent = `${Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12)}y ago`;
        }
        else if (isDecadesAgo) {
            date.textContent = `${Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12 / 5)}d ago`;
        }
        else if (isCenturiesAgo) {
            date.textContent = `${Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12 / 5 / 10)}c ago`;
        }
        else {
            date.textContent = this.setToFrenchDate(unixTime ?? (entry.rss?.lastFetched || entry.meta.updated));
        }

        return date;
    }
    private buildNovelType(entry: HermidataModel): HTMLDivElement {
        // container
        const container = document.createElement('div');
        container.className = "hermidata-item-novelType-container";

        // svg
        const svg = this.buildNovelTypeSVG(entry);

        // Novel Type
        const type = this.buildInnerNovelType(entry);

        // append
        container.append(svg, type);

        // return
        return container;
    }
    private buildNovelTypeSVG(entry: HermidataModel): SVGSVGElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'hermidata-item-novelType-svg');
        svg.setAttribute('width', '25px');
        svg.setAttribute('height', '25px');

        const circle = this.buildNovelTypeCircle(entry);

        svg.appendChild(circle);

        return svg;
    }
    private buildNovelTypeCircle(entry: HermidataModel): SVGCircleElement {
        const color = this.getColorBasedOnNovelType(entry);

        const radius = 10;
        const centerPosition = 12;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');

        circle.setAttribute('class', 'hermidata-item-novelType-circle');
        circle.setAttribute('cx', String(centerPosition));
        circle.setAttribute('cy', String(centerPosition));
        circle.setAttribute('r', String(radius));
        circle.setAttribute('fill', color);

        return circle;
    }
    private getColorBasedOnNovelType(entry: HermidataModel): string {
        switch (entry.novelType) {
            case 'Manga':
                return '#ff8a00'; // orange
            case 'Manhwa':
                return '#3429cf'; // blue
            case 'Manhua':
                return '#48ce44'; // green
            case 'Webnovel':
                return '#e94427'; // red
            case 'Novel':
                return '#c9db22'; // yellow
            case 'OneShot':
                return '#5e00ca'; // purple
            case 'Anime':
                return '#c52bb1'; // pink
            case 'TV-Series':
                return '#6d4a2e'; // brown
            default:
                return '#ff8a00';
        }
    }
    private buildInnerNovelType(entry: HermidataModel): HTMLParagraphElement {
        const novelType = document.createElement('p');
        novelType.className = "hermidata-item-novelType";

        novelType.textContent = entry.novelType;

        return novelType;
    }
    private buildCheckbox(): HTMLDivElement {
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = "hermidata-item-checkbox-container";

        const invisibleContainer = document.createElement('div');
        invisibleContainer.className = "hermidata-item-checkbox-invisible-container";

        const checkbox = document.createElement('input');
        checkbox.className = "hermidata-item-checkbox";

        checkbox.type = "checkbox";
        checkbox.checked = false;
        checkbox.ariaChecked = 'false';

        const value = this.viewMode === 'list' ? '-20px' : '10px';

        invisibleContainer.style.transform = `translateX(${value})`;

        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            // your existing checkbox logic here
        });

        invisibleContainer.appendChild(checkbox);
        checkboxContainer.appendChild(invisibleContainer);

        return checkboxContainer;
    }
}



