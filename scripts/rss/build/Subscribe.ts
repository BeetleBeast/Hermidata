import { TrimTitle } from "../../shared/StringOutput";
import type { NovelType } from "../../shared/types/type";
import { getElement } from "../../utils/Selection";
import { RssBuild } from "../build";
import { linkRSSFeed, loadSavedFeedsViaSavedFeeds } from "../load";

export class Subscribe extends RssBuild {

    public async makeSubscibeBtn(): Promise<void> {
            const feedListGLobal = await loadSavedFeedsViaSavedFeeds();
            const subscribeBtn = getElement<HTMLButtonElement>("#subscribeBtn");
            const NotificationSection = getElement("#RSS-Notification");
            const AllItemSection = getElement("#All-RSS-entries");
    
            if (!subscribeBtn || !NotificationSection || !AllItemSection) throw new Error('Element not found');
    
            subscribeBtn.className = "Btn";
            subscribeBtn.textContent = "Subscribe to RSS Feed";
            subscribeBtn.disabled = true;
            subscribeBtn.title = "this site doesn't have a RSS link";
            subscribeBtn.ariaLabel = "this site doesn't have a RSS link";
    
            let feedItemTitle;
            const currentTitle = getElement<HTMLInputElement>("#title_HDRSS")?.value || this.hermidata.title;
    
            Object.values(feedListGLobal).forEach(feed => {
                feedItemTitle = TrimTitle.trimTitle(feed?.items?.[0]?.title || feed.title, feed.url).title
                if (currentTitle == feedItemTitle) {
                    subscribeBtn.disabled = false
                    subscribeBtn.title = "subscribe to recieve notifications"
                    subscribeBtn.ariaLabel = "subscribe to recieve notifications"
                    console.log("current page is a feed page \n", currentTitle)
                }
            });
            subscribeBtn.onclick = () => {
                Object.values(feedListGLobal).forEach(feed => {
                    feedItemTitle = TrimTitle.trimTitle(feed?.items?.[0]?.title || feed.title, feed.url).title
                    if (currentTitle == feedItemTitle) {
                        const currentType = getElement<HTMLInputElement>("#Type_HDRSS")?.value as NovelType || this.hermidata.type;
                        linkRSSFeed(feedItemTitle, currentType, this.hermidata.url,  feed);
                        this.reloadContent(NotificationSection, AllItemSection)
                        console.log('linked RSS to extention')
                    }
                });
            }
        }
}