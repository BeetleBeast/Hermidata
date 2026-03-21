import { findByTitleOrAltV2, getChapterFromTitleReturn, TrimTitle } from "../../shared/StringOutput";
import type { SettingsInput } from "../../shared/types/settings";
import { getLocalNotificationItem, getSettings } from "../../shared/types/Storage";
import type { AllHermidata, Hermidata } from "../../shared/types/type";
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
    
    constructor(AllHermidata: AllHermidata) {
        this.AllHermidata = AllHermidata;
    }

    public async makefeedItem(hermidataList: Record<string, Hermidata>, isRSSItem = false): Promise<DocumentFragment> {
        const fragment = document.createDocumentFragment();
        for (const [key, item] of Object.entries(hermidataList)) {

            const itemInfo = await this.getItemInfo(key, item, isRSSItem);

            const settings = await getSettings();
            // removed && ( seachable || (chapter !== currentChapter ))
            if ( getElement(`.TitleHash-${key}`) && itemInfo.isRead && itemInfo.clearedNotification) continue;

            const li = this.createItemContainer(key, isRSSItem);

            const itemImage = this.createItemImage(item, isRSSItem);

            
            const ElTagContainer = this.createItemTags(itemInfo.currentHermidata, settings, isRSSItem );
            
            
            const ItemInfoContainer = this.createItemInfoContainer(key, item, itemInfo, itemImage, isRSSItem);

            const Elfooter = this.createItemFooter(itemInfo.currentHermidata, item, isRSSItem);
            
            
            li.append(ElTagContainer, ItemInfoContainer, Elfooter);

            fragment.appendChild(li);
        }
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
    private createItemPubDate(item: Hermidata, isRSSItem: boolean): HTMLElement {
        const pubDate = document.createElement("p");
        pubDate.className = isRSSItem ? "RSS-entries-item-pubDate" : "RSS-Notification-item-pubDate";
        pubDate.textContent = `Published: ${item.rss?.latestItem.pubDate ? item.rss?.latestItem.pubDate.toLocaleString() : 'N/A'}`;
        return pubDate
    }
    private createItemFooter(currentHermidata: Hermidata, item: Hermidata, isRSSItem: boolean): HTMLElement {
        const Elfooter = document.createElement("div");

        // TODO: add tags a second time?
        if ( currentHermidata?.meta?.tags?.length > 0) {
            const tagDicContainer = document.createElement('div')
            tagDicContainer.className = "tag-div-container"
            for (const tag in currentHermidata?.meta?.tags) {
                const tagDiv = document.createElement('div');
                tagDiv.textContent = tag;
                tagDiv.className = 'tag-div';
                tagDicContainer.appendChild(tagDiv)
            }
            Elfooter.appendChild(tagDicContainer)
        }
        Elfooter.className =  isRSSItem ? "RSS-entries-item-footer" :"RSS-Notification-item-footer";
        const domain = item.source || item.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]
        Elfooter.textContent = `${domain}`;
        return Elfooter
    }
    private createItemTitle(title: string, url: string, item: Hermidata, isRSSItem = false): HTMLElement {
        const ELTitle = document.createElement("div");
        
        ELTitle.className = isRSSItem ? "RSS-entries-item-title" : "RSS-Notification-item-title";
            
        const titleTextTrunacted = this.createTitleText(title, url, item);
            
        ELTitle.textContent = `${titleTextTrunacted}`;
        
        return ELTitle
    }
    private createItemChapter(chapter: number, currentChapter: number, isRSSItem: boolean = false): HTMLElement {
        const ELchapter = document.createElement("div");

        const chapterText = chapter ? `latest Chapter: ${chapter}` : 'No chapter info';
        const AllItemChapterText = currentChapter == chapter ?  `up-to-date (${chapter})` : `read ${currentChapter} of ${chapter}`;
        

        ELchapter.className = isRSSItem ? "RSS-entries-item-chapter" : "RSS-Notification-item-chapter";
        ELchapter.textContent = isRSSItem ? `${AllItemChapterText}` : `${chapterText}`;

        return ELchapter
    }
    private getItemTitle(title: string, url: string, item: Hermidata): string {
        const titleV1 = title;
        const titleV2 = TrimTitle.trimTitle(title, url).title;
        const titleV3 = TrimTitle.trimTitle(item?.rss?.latestItem.title || item.title, item?.rss?.latestItem.link || item.url).title;
        
        console.log('Title: ', titleV1, 'Trimmed title V1: ', titleV2, 'What i had before: ', titleV3);
        return titleV2
    }
    private createTitleText(title: string, url: string, item: Hermidata): string {
        const titleText = this.getItemTitle(title, url, item);
        const maxTitleCharLangth = 50;
        const titleTextTrunacted = titleText.length > maxTitleCharLangth ? titleText.slice(0, maxTitleCharLangth - 3) + '...' : titleText;

        return titleTextTrunacted
    }
    private createItemChapterProgress(key: string, chapter: number, isRSSItem: boolean): HTMLElement {
        const ELprogress = document.createElement("div");
        ELprogress.className = isRSSItem ? "RSS-entries-item-progress" : "RSS-Notification-item-progress";
        const lastRead = this.AllHermidata[key]?.chapter?.current || null;
        const progress = lastRead ? ((lastRead / chapter) * 100 ).toPrecision(3) : '0';
        ELprogress.textContent = `${progress}%`;
        return ELprogress
    }
    private createItemTags(currentHermidata: Hermidata, settings: SettingsInput, isRSSItem = false): HTMLElement {
        // TODO: creates tags a first time
        const ElTagContainer = document.createElement("div");
        ElTagContainer.className =  isRSSItem ? "RSS-entries-item-tag-container" : "RSS-Notification-item-tag-container";
        if ( currentHermidata.meta?.tags.length > 0 ) {
            const tags = currentHermidata.meta?.tags as (string[] | string);
            const allTags = Array.isArray(tags) ? tags : tags?.split(',');
            for (let index in allTags) {
                const tagName = allTags[index]
                const tagDiv = document.createElement('div');
                tagDiv.classList = `tag-div tag-div-${tagName}`;
                tagDiv.textContent = `[${tagName}]`;
                tagDiv.style.color = settings.tagColoring?.[tagName] || 'white';
                tagDiv.dataset.TagColor = settings.tagColoring?.[tagName] || 'white';
                ElTagContainer.append(tagDiv)
            }
        }
        return ElTagContainer
    }
    private createItemInfoContainer(key: string, item: Hermidata, itemInfo: ItemInfo, itemImage: HTMLImageElement, isRSSItem: boolean): HTMLElement {
        const ElInfo = document.createElement("div");
        ElInfo.className =  isRSSItem ? "RSS-entries-item-info" : "RSS-Notification-item-info";

        const itemTitle = this.createItemTitle(itemInfo.title, itemInfo.url, item, isRSSItem);
        const ELchapter = this.createItemChapter(itemInfo.chapter, itemInfo.currentChapter, isRSSItem);
        const ELprogress = this.createItemChapterProgress(key, itemInfo.chapter, isRSSItem);
        const pubdate = this.createItemPubDate(item, isRSSItem);

        ElInfo.append(itemImage, itemTitle, ELchapter, pubdate, ELprogress);

        return ElInfo
    }
    private createItemImage(item: Hermidata, isRSSItem: boolean= false): HTMLImageElement {
        const ElImage = document.createElement("img");
        ElImage.className = isRSSItem ? "RSS-entries-item-image" : "RSS-Notification-item-image";
        ElImage.src = item?.rss?.image || 'icons/icon48.png';
        ElImage.sizes = "48x48";
        ElImage.style.width = "48px";
        ElImage.style.height = "48px";
        ElImage.style.objectFit = "contain";
        ElImage.style.borderRadius = "8px";
        ElImage.alt = "Feed Image";

        return ElImage;
    }

    private createItemContainer(key: string, isRSSItem: boolean = false): HTMLElement {
        const li = document.createElement("li");
        li.className = isRSSItem ? "RSS-entries-item" : "RSS-Notification-item";
        li.classList.add("hasRSS", `TitleHash-${key}`, 'seachable');
    
        return li
    }
}

