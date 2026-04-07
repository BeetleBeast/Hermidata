import { findByTitleOrAltV2, getChapterFromTitleReturn } from "../../shared/StringOutput";
import type { SettingsInput, AllHermidata, Hermidata } from "../../shared/types/index";
import { getLocalNotificationItem, getSettings } from "../../shared/db/Storage";
import { getElement } from "../../utils/Selection";


interface ItemInfo {
    title: string;
    url: string;
    chapter: number;
    isRead: boolean;
    clearedNotification: boolean;
    currentChapter: number;
    currentHermidata: Hermidata;
}



export class FeedItem {

    protected AllHermidata: AllHermidata;
    private isFirstItem = false;
    
    constructor(AllHermidata: AllHermidata) {
        this.AllHermidata = AllHermidata;
    }

    public async makefeedItem(hermidataList: Record<string, Hermidata>, isRSSItem = false): Promise<DocumentFragment> {
        console.group('makefeedItem');
        console.time('makefeedItem');
        const fragment = document.createDocumentFragment();
        for (const [key, item] of Object.entries(hermidataList)) {
            this.isFirstItem = Object.keys(hermidataList)[0] === key
            
            const itemInfo = await this.getItemInfo(key, item, isRSSItem);
            if ( getElement(`[data-hash-key="${key}"]`)?.dataset.hashKey && itemInfo.isRead && itemInfo.clearedNotification) continue;

            const li = this.createItemContainer(key, isRSSItem);

            const lines = this.createItemLines(item);
            
            const ItemInfoContainer = await this.createItemInfoContainer(key, item, itemInfo, isRSSItem);
            
            li.append(lines, ItemInfoContainer);
            fragment.appendChild(li);
        }
        console.timeEnd('makefeedItem');
        console.groupEnd();
        return fragment
    }
    public makeFeedHeader(parent_section: HTMLElement) {
        if (getElement('.containerHeader-feed')) return
        const lastDirection = JSON.parse(localStorage.getItem('notificationLastDirection') ?? '"down"');
        const container = document.createElement('div');
        container.className = 'containerHeader-feed'
        const title = document.createElement('div');
        title.className = "titleHeader";
        title.textContent = 'Notifications'
        container.appendChild(title);
        const feedHeadersymbol = document.createElement('div');
            feedHeadersymbol.className = 'feed-header-symbol';
            feedHeadersymbol.dataset.feedState = lastDirection;
        container.addEventListener('click', () => {
                feedHeadersymbol.dataset.feedState = feedHeadersymbol.dataset.feedState === 'down' ? 'up' : 'down';
                localStorage.setItem('notificationLastDirection', JSON.stringify(feedHeadersymbol.dataset.feedState));
            });
        title.appendChild(feedHeadersymbol);

        parent_section.appendChild(container)
    }
    public makeItemHeader(): Node {
        const containerAlreadyExist = getElement('.containerHeader-item')
        if (containerAlreadyExist) return containerAlreadyExist;

        const container = document.createElement('div');
        container.className = 'containerHeader-item'
        const title = document.createElement('div');
        title.className = "titleHeader";
        title.textContent = 'All saved items'
        container.appendChild(title);
        return container
    }
    private CreateLine(Position: { x1: string; y1: string; x2: string; y2: string }, className: string) {
        const svgNS = "http://www.w3.org/2000/svg";
        
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', Position.x1);
        line.setAttribute('y1', Position.y1);
        line.setAttribute('x2', Position.x2);
        line.setAttribute('y2', Position.y2);
        line.setAttribute("class",`${className} hermidata-item-lines`);
        return line
    }
    private CreateNotifyRSSLinkIcon(): SVGElement {
        const svgNS = "http://www.w3.org/2000/svg";
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'notify-rss-link-icon-group hermidata-item-lines rss-link-missing-icon');
        g.setAttribute('transform', 'scale(0.5) translate(300, 70)');
        g.innerHTML = `
            <path d="M45.764,68.114c0,2.448,1.984,4.433,4.434,4.433s4.434-1.984,4.434-4.433c0-2.451-1.984-4.435-4.434-4.435 S45.764,65.663,45.764,68.114z"></path>
            <path d="M52.5,54.881v-23c0-1.104-0.896-2-2-2s-2,0.896-2,2v23c0,1.104,0.896,2,2,2S52.5,55.985,52.5,54.881z"></path>
        `;
        return g;
    }
    private CreateSidestriangle(): { groupLeft: SVGGElement; groupRight: SVGGElement } {
        const svgNS = "http://www.w3.org/2000/svg";
        
        const diamondLeft = document.createElementNS(svgNS, 'polygon');
        diamondLeft.setAttribute("class", "diamond-group-l");
    
        const diamondgroupLeft = document.createElementNS(svgNS, 'g');
        diamondgroupLeft.setAttribute("class", "diamond-l");
        diamondgroupLeft.appendChild(diamondLeft);
        

        const diamondRight = document.createElementNS(svgNS, 'polygon');
        diamondRight.setAttribute("class", "diamond-group-r");

        const diamondgroupRight = document.createElementNS(svgNS, 'g');
        diamondgroupRight.setAttribute("class", "diamond-r");
        diamondgroupRight.appendChild(diamondRight);
        return { groupLeft: diamondgroupLeft, groupRight: diamondgroupRight }
    }
    private CreateSidesDiamond(): { groupLeft: SVGGElement; groupRight: SVGGElement } {
        const svgNS = "http://www.w3.org/2000/svg";

        
        const diamondLeft = document.createElementNS(svgNS, 'polygon');
        diamondLeft.setAttribute("class", "diamond-l");
        diamondLeft.setAttribute('transform', `translate(0, 0)`);

        const diamondRight = document.createElementNS(svgNS, 'polygon');
        diamondRight.setAttribute("class", "diamond-r");
        

        const diamondgroupLeft = document.createElementNS(svgNS, 'g');
        diamondgroupLeft.setAttribute("class", "diamond-group-l");

        const diamondgroupRight = document.createElementNS(svgNS, 'g');
        diamondgroupRight.setAttribute("class", "diamond-group-r");
        
        
        diamondgroupLeft.appendChild(diamondLeft);
        diamondgroupRight.appendChild(diamondRight);

        return { groupLeft: diamondgroupLeft, groupRight: diamondgroupRight }
    }
    private createItemLines(item: Hermidata) {
        const svgNS = "http://www.w3.org/2000/svg";
        
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', '100px');
        svg.setAttribute('height', '100px');
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("class", "hermidata-item-svg");
        // outside border lines
        const topLine = this.CreateLine({ x1: "8px", y1: "0", x2: "99%", y2: "0" }, "line-h line-top item-lines");
        const bottomLine = this.CreateLine({ x1: "8px", y1: "100%", x2: "99%", y2: "100%" }, "line-h line-bottom item-lines");
        const leftLine = this.CreateLine({ x1: "0", y1: "8px", x2: "0", y2: "100%" }, "line-v line-left item-lines");
        const rightLine = this.CreateLine({ x1: "100%", y1: "8px", x2: "100%", y2: "100%" }, "line-v line-right item-lines");
        // lines
        const topLeftBend = this.CreateLine({ x1: "10%", y1: "0%", x2: "15%", y2: "50%" }, "line-h line-top-left-bend item-lines");
        const middelHorizontal = this.CreateLine({ x1: "8%", y1: "50%", x2: "98%", y2: "50%" }, "line-v line-middel-horizontal item-lines" );
        const topRightBend = this.CreateLine({ x1: "85%", y1: "50%", x2: "90%", y2: "0%" }, "line-h line-top-right-bend item-lines" );
        const bottomLeftBend = this.CreateLine({ x1: "15%", y1: "50%", x2: "40%", y2: "100%" }, "line-bottom-left-bend item-lines" );
        const bottomRightBend = this.CreateLine({ x1: "60%", y1: "100%", x2: "85%", y2: "50%" }, "line-bottom-right-bend item-lines" );
        const bottomVertical = this.CreateLine({ x1: "50%", y1: "50%", x2: "50%", y2: "100%" }, "line-bottom-vertical item-lines" );
        // diamond
        let x1 = 0, y1 = -12;
        let x2 = 12, y2 = 0;
        let x3 = 0, y3 = 12;
        let x4 = -12, y4 = 0;
        const diamondgroup = document.createElementNS(svgNS, 'g');
        diamondgroup.setAttribute("class", "diamond-group-line");
        const diamond = document.createElementNS(svgNS, 'polygon');
        
        diamond.setAttribute('points',`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`);
        diamond.setAttribute("class", "line-diamond hermidata-item-lines");
        item.rss?.latestItem ? diamond.style.fill = "#3c5ca6" : diamond.style.fill = "rgba(1, 175, 118, 0.87)";

        const titleOfDiamond = this.createSVGItemTitle(item.rss?.latestItem ? "This Item is linked" : "this Item is not linked to a RSS feed")
        diamond.appendChild(titleOfDiamond);
        diamondgroup.appendChild(diamond);
        
        // RSS link missing Icon ( only for non RSS items)
        if (!item.rss?.latestItem) {
            const notifyRSSLinkIcon = this.CreateNotifyRSSLinkIcon();

            const titleOfExclamation = this.createSVGItemTitle("This Item can not be updated via RSS feed because no RSS feed is linked to it.")
            notifyRSSLinkIcon.appendChild(titleOfExclamation);
            
            svg.appendChild(notifyRSSLinkIcon);
        }

        const { groupLeft, groupRight } = this.isFirstItem ? this.CreateSidestriangle() : this.CreateSidesDiamond();
        svg.append(
            groupLeft, groupRight, 
            diamondgroup, topLeftBend, 
            middelHorizontal, topRightBend, bottomLeftBend, bottomRightBend, 
            bottomVertical, 
            topLine, bottomLine, leftLine, rightLine);
        return svg
    }
    private createSVGItemTitle(title: string): SVGTitleElement {
        const svgNS = "http://www.w3.org/2000/svg";
        const elTitle = document.createElementNS(svgNS, 'title');
        elTitle.innerHTML = title;
        return elTitle;
    }
    private async getItemInfo(key: string, item: Hermidata, isRSSItem: boolean = false): Promise<ItemInfo> {
        const title = findByTitleOrAltV2(item.title, this.AllHermidata)?.title || item.title;
        const url = item.rss?.latestItem.link || item.url;
        
        const useAutoDetectedChapter = getChapterFromTitleReturn(title, item?.title, undefined, url);
        const chapter = item?.chapter?.latest || useAutoDetectedChapter || item?.chapter?.current;
        
        const currentHermidata =this.AllHermidata?.[key]
        const currentChapter = currentHermidata?.chapter?.current
        const clearedNotification = await getLocalNotificationItem(key);
        const isRead = !isRSSItem && (currentChapter === chapter)
        
        return { title, url, chapter, isRead, clearedNotification, currentChapter, currentHermidata };
    }
    private createItemPubDate(item: Hermidata): HTMLElement {
        const pubDate = document.createElement("p");
        pubDate.className = "hermidata-item-pubDate"
        const dateString = item.rss?.latestItem.pubDate ? new Date(item.rss.latestItem.pubDate).toLocaleDateString() : 'N/A';
        const pubDateText = `Published: ${dateString}`;
        pubDate.textContent = pubDateText;
        pubDate.title = pubDateText;
        return pubDate
    }
    private createItemFooter(item: Hermidata): HTMLElement {
        const Elfooter = document.createElement("div");

        Elfooter.className = "hermidata-item-footer"
        const domain = item.source || item.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]
        Elfooter.textContent = String(domain);
        Elfooter.title = String(domain);
        return Elfooter
    }
    private createItemTitle(title: string): HTMLElement {
        const ELTitle = document.createElement("div");
        ELTitle.className = "hermidata-item-title"
        ELTitle.title = title;

        ELTitle.textContent = title;
        
        return ELTitle
    }
    private createItemChapter(chapter: number, currentChapter: number, isRSSItem: boolean = false): HTMLElement {
        const ELchapter = document.createElement("div");

        const chapterText = chapter ? `latest Chapter: ${chapter}` : 'No chapter info';
        const AllItemChapterText = currentChapter == chapter ?  `up-to-date (${chapter})` : `read ${currentChapter} of ${chapter}`;
        

        ELchapter.className = "hermidata-item-chapter"
        ELchapter.textContent = isRSSItem ? `${AllItemChapterText}` : `${chapterText}`;

        return ELchapter
    }
    private createItemChapterProgress(key: string, chapter: number): HTMLElement {
        const ELprogress = document.createElement("div");
        ELprogress.className = "hermidata-item-progress"
        const lastRead = this.AllHermidata[key]?.chapter?.current || null;
        const progress = lastRead ? ((lastRead / chapter) * 100 ).toPrecision(3) : '0';
        ELprogress.textContent = `${progress}%`;
        return ELprogress
    }
    private createItemTags(currentHermidata: Hermidata, settings: SettingsInput): HTMLElement {
        const ElTagContainer = document.createElement("div");
        ElTagContainer.className = "hermidata-item-tag-container";
        let allTagsInString: string = "";
        if ( currentHermidata.meta?.tags.length > 0 ) {
            const tags = currentHermidata.meta?.tags as (string[] | string);
            const allTags = Array.isArray(tags) ? tags : tags?.split(',');
            for (const tagName of allTags) {
                if (tagName === '') continue;
                const tagDiv = document.createElement('div');
                tagDiv.classList = `tag-div tag-div-${tagName}`;
                tagDiv.textContent = `[${tagName}]`;
                allTagsInString += `[${tagName}]`;
                tagDiv.style.color = settings.tagColoring?.[tagName] || 'white';
                tagDiv.dataset.TagColor = settings.tagColoring?.[tagName] || 'white';
                ElTagContainer.append(tagDiv)
            }
            ElTagContainer.dataset.tags = JSON.stringify(allTags);
        }
        ElTagContainer.title = currentHermidata.meta?.tags.length > 0 ? allTagsInString : "No tags";

        return ElTagContainer
    }
    private async createItemInfoContainer(key: string, item: Hermidata, itemInfo: ItemInfo, isRSSItem: boolean): Promise<HTMLElement> {
        const settings = await getSettings();
        const ElInfo = document.createElement("div");
        ElInfo.className = "hermidata-item-info"

        // image
        const itemImage = this.createItemImage(item);

        // top row
        const itemTitle = this.createItemTitle(itemInfo.title);
        const ELprogress = this.createItemChapterProgress(key, itemInfo.chapter);

        // bottom row container
        const bottomRow = document.createElement("div");
        bottomRow.className = "bottom-row";
        
        // bottom row
        const ELchapter = this.createItemChapter(itemInfo.chapter, itemInfo.currentChapter, isRSSItem);
        const pubdate = this.createItemPubDate(item);
        const Elfooter = this.createItemFooter(item);
        const ElTagContainer = this.createItemTags(itemInfo.currentHermidata, settings );

        bottomRow.append(ELchapter, Elfooter, pubdate, ElTagContainer);
        ElInfo.append(itemImage, itemTitle, ELprogress, bottomRow);

        return ElInfo
    }
    private createItemImage(item: Hermidata): HTMLImageElement {
        const ElImage = document.createElement("img");
        ElImage.className = "hermidata-item-image"
        ElImage.src = item?.rss?.image ?? '../../../assets/icon/icon48.png';

        ElImage.sizes = "40x60";
        ElImage.style.width = "40px";
        ElImage.style.height = "60px";
        ElImage.style.objectFit = "contain";
        ElImage.style.borderRadius = "8px";
        ElImage.alt = "Feed Image";

        return ElImage;
    }

    private createItemContainer(key: string, isRSSItem: boolean = false): HTMLElement {
        const li = document.createElement("li");
        li.dataset.isNotificationItem = isRSSItem ? 'false' : 'true';
        li.dataset.hashKey = key;
        li.dataset.hasRSS = 'true';
        li.dataset.seachable = 'true';
        li.style.setProperty('--line-h2-y', `0px`);
        li.style.setProperty('--line-h1-y', `0px`);
        li.style.setProperty('--line-v1-x', `0px`);
        li.classList.add('hermidata-item');
    
        return li
    }
}

