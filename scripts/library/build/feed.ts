import type { Hermidata, Settings } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { openLink } from "../../shared/utils/StringOutput";
import { LibraryBuilder } from "../build";

export class feed extends LibraryBuilder {

    private readonly AllHermidataContainer: HTMLDivElement | null = document.querySelector('#library-entries-container');

    public viewMode: 'grid' | 'list' = 'list';

    /** Loads a cover once its entry comes near the screen: the page shows its entries without waiting on every image */
    private readonly coverObserver = new IntersectionObserver(entries => this.loadCoversInView(entries), { rootMargin: '600px 0px' });

    /** The entry each cover still waiting for the observer belongs to */
    private readonly pendingCovers = new Map<HTMLImageElement, HermidataModel>();
    
    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        super(allHermidata, settings);
    }


    public build(): void {
        this.buildFeedAll();
    }
    /** Rebuild every entry from the current data */
    public reload(): void {
        this.buildFeedAll();
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
    }

    private buildFeedAll() {
        // the old entries are gone: stop waiting on their covers
        this.coverObserver.disconnect();
        this.pendingCovers.clear();

        const docFragment = document.createDocumentFragment();

        for (const entry of Object.values(this.AllHermidata)) {
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
        const checkbox = this.buildCheckbox(entry.title);

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

        // the selection checkbox is revealed on hover / focus by CSS ( library/feed.css )
        container.addEventListener('click', () => openLink('./Overview.html#/id/' + entry.id, 'sameTab'));

        return container;
    }
    private buildImage(entry: HermidataModel): HTMLImageElement {
        const img = document.createElement('img');

        img.className = "hermidata-item-image"
        img.sizes = "150x190";
        img.alt = `${entry.title} Image`;

        // the cover itself loads once the entry is near the screen ( filtered out entries are not shown, so they wait )
        this.pendingCovers.set(img, entry);
        this.coverObserver.observe(img);

        return img;
    }
    private loadCoversInView(entries: IntersectionObserverEntry[]): void {
        for (const { target, isIntersecting } of entries) {
            if (!isIntersecting) continue;
            const img = target as HTMLImageElement;
            const entry = this.pendingCovers.get(img);
            this.coverObserver.unobserve(img);
            this.pendingCovers.delete(img);
            if (entry) void this.loadCover(img, entry);
        }
    }
    private async loadCover(img: HTMLImageElement, entry: HermidataModel): Promise<void> {
        img.addEventListener('load', () => this.calculateImageRatio(img), { once: true });
        img.addEventListener('error', () => {
            console.warn('Image failed to load:', img.src);
            this.calculateImageRatio(img);
        }, { once: true });

        img.src = await entry.getDisplayImageUrl();
    }
    private buildTitle(entry: Hermidata): HTMLAnchorElement {
        // a real link: focusable, announced as a link and opened with Enter. The entry click handler does the navigation.
        const title = document.createElement('a');
        title.className = "hermidata-item-title";
        title.href = './Overview.html#/id/' + entry.id;
        title.addEventListener('click', (e) => e.preventDefault());

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
        const latestFeed = HermidataModel.GetLatestRssFeed(entry.rss, "lastFetched");
        const timeUsing = latestFeed?.lastFetched ? new Date(latestFeed.lastFetched).toISOString() : new Date(entry.meta.updated).toISOString();
        const dateText = this.getTimeAgo(timeUsing);
        date.textContent = dateText;

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
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('width', '25px');
        svg.setAttribute('height', '25px');
        // viewBox lets CSS scale the dot without clipping the circle
        svg.setAttribute('viewBox', '0 0 24 24');

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
    private buildCheckbox(title: string): HTMLDivElement {
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = "hermidata-item-checkbox-container";

        const invisibleContainer = document.createElement('div');
        invisibleContainer.className = "hermidata-item-checkbox-invisible-container";

        const checkbox = document.createElement('input');
        checkbox.className = "hermidata-item-checkbox";

        checkbox.type = "checkbox";
        checkbox.checked = false;
        checkbox.ariaChecked = 'false';
        checkbox.setAttribute('aria-label', `Select ${title}`);

        checkbox.addEventListener('click', (e) => e.stopPropagation());

        invisibleContainer.appendChild(checkbox);
        checkboxContainer.appendChild(invisibleContainer);

        return checkboxContainer;
    }
}
