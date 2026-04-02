import { type AllHermidata, type Hermidata } from "../shared/types/popupType";
import {  getHermidataWithRssFromBackground } from "./load";
import { PastHermidata } from "../popup/core/Past";

import { FeedItem } from "./build/feed";

export abstract class RssBuild {
    protected readonly hermidata: Hermidata;

    protected AllHermidata: AllHermidata;

    constructor(hermidata: Hermidata, AllHermidata: AllHermidata) {
        this.hermidata = hermidata;
        this.AllHermidata = AllHermidata;
    }
    public static async init(): Promise<AllHermidata> {
        return await PastHermidata.getAllHermidata();
    }
    protected removeAllChildNodes(parent: HTMLElement) {
        while (parent.firstChild) parent.lastChild!.remove();
    }
    protected async reloadContent(NotificationSection: HTMLElement,AllItemSection: HTMLElement) {
        this.removeAllChildNodes(NotificationSection) // clear front-end
        this.removeAllChildNodes(AllItemSection) // clear front-end

        new FeedItem(this.AllHermidata).makeFeedHeader(NotificationSection);

        await chrome.runtime.sendMessage({ type: 'INVALIDATE_RSS' });

        const feedListLocalReload = await getHermidataWithRssFromBackground();
    
        NotificationSection.appendChild(await new FeedItem(this.AllHermidata).makefeedItem(feedListLocalReload, false));
        AllItemSection.appendChild(new FeedItem(this.AllHermidata).makeItemHeader());
        AllItemSection.appendChild(await new FeedItem(this.AllHermidata).makefeedItem(feedListLocalReload, true));
    }
    protected GetHashItem(item: HTMLElement): string {
        const newVersion = item.dataset.hashKey;
        if(!newVersion) throw new Error('hash not found');

        return newVersion;
    }
}

export function positionItemLines(li: HTMLElement): void {
        const svg = li.querySelector<SVGElement>('.hermidata-item-svg');
        const info = li.querySelector<HTMLElement>('.hermidata-item-info');
        const footer = li.querySelector<HTMLElement>('.hermidata-item-footer');
        const tagContainer = li.querySelector<HTMLElement>('.hermidata-item-tag-container');
        if (!svg || !info || !footer || !tagContainer) return;

        li.style.setProperty('--line-h2-y', `${0}px`);
        li.style.setProperty('--line-h1-y', `${0}px`);
        li.style.setProperty('--line-v1-x', `${0}px`);
}
export function positionDiamond(li: HTMLElement): void {
    
    // left side diamond
    const svg = li.querySelector<SVGElement>('.hermidata-item-svg');
    const footer = li.querySelector<HTMLElement>('.hermidata-item-footer');
    const image = li.querySelector<HTMLElement>('.hermidata-item-image');
    if (!svg || !footer) return;
    // FIXME: the notification items don't get set as thy are hidden and so can't have their bounding rect calculated
    const liRect = li.getBoundingClientRect();
    const right = liRect.right - liRect.left;
    const imageRect = image?.getBoundingClientRect();
    if ( !imageRect ) return;
    const imageRightPosition = imageRect.right - imageRect.left; // 60
    const ImagePadding = '10';

    // Move the diamond group to the right position
    const diamond = svg.querySelector<SVGGElement>('.diamond-group-l');
    diamond?.setAttribute('transform', `translate(0, 0)`);

    // Move the diamond group to the right position
    const diamond2 = svg.querySelector<SVGGElement>('.diamond-group-r');
    diamond2?.setAttribute('transform', `translate(${right}, 0)`);
    
    // move main svg to the correct position
    const lineDiamond = svg.querySelector<SVGGElement>('.diamond-group-line');
    lineDiamond?.setAttribute('transform', `translate(75, 22)`);
}
// needs to be set after sort
export function updatePolygons() {
    const NotificationItems = document.querySelectorAll<HTMLElement>('.hermidata-item[data-is-notification-item="true"]');
    const AllItems = document.querySelectorAll<HTMLElement>('.hermidata-item[data-is-notification-item="false"]');

    // calculate coordinates distance needed
    const liRect = AllItems[0].getBoundingClientRect();
    const distanceToPoints = liRect.width  / 10; // TODO: get from css

    const { positionLeft: trianglePositionLeft, positionRight: trianglePositionRight } = triangleCoord();
    const { positionLeft: diamondPositionLeft, positionRight: diamondPositionRight } = diamondCoord();

    const loopTroughItems = (items: NodeListOf<HTMLElement>) => {
        for (const item of items) {
            const index = Array.from(items).indexOf(item);
            const polygonLeft = item.querySelector('.diamond-l');
            const polygonRight = item.querySelector('.diamond-r');
        
            if (index === 0) {
                // First item → no upward overlap
                polygonLeft?.setAttribute('points', trianglePositionLeft);
                polygonRight?.setAttribute('points', trianglePositionRight);
            } else {
                // Others → normal overlap shape
                polygonLeft?.setAttribute('points', diamondPositionLeft);
                polygonRight?.setAttribute('points', diamondPositionRight);
            }
        }
    }

    loopTroughItems(NotificationItems);
    loopTroughItems(AllItems);
}

function triangleCoord(distanceToPoints: number = 8) {

    let x1 = 0, y1 = 0;
    let x2 = distanceToPoints, y2 = 0;
    let x3 = 0, y3 = distanceToPoints;
    let x4 = -distanceToPoints, y4 = 0;

    const positionTriangleLeft = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`;
    const positionTriangleRight = `${-x1},${y1} ${-x2},${y2} ${-x3},${y3} ${-x4},${y4}`;

    return { positionLeft: positionTriangleLeft, positionRight: positionTriangleRight };
}
function diamondCoord(distanceToPoints: number = 8) {

    let x1 = 0, y1 = -distanceToPoints;
    let x2 = distanceToPoints, y2 = 0;
    let x3 = 0, y3 = distanceToPoints;
    let x4 = -distanceToPoints, y4 = 0;

    const positionLeft = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`;
    const positionRight = `${-x1},${y1} ${-x2},${y2} ${-x3},${y3} ${-x4},${y4}`;

    return { positionLeft: positionLeft, positionRight: positionRight };
}