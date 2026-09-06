





const ITEM_LAYOUT = {
    image: {
        paddingLeft: 12,
        width: 40,
        paddingRight: 2,
    },
    diamond: {
        centerY: 22,
        maxSize: 12,
        minSize: 4,
        sizeRatioDivisor: 2 + (1 / 3), // divisor for scaling diamond to available space
    },
    sides: {
        defaultSize: 8,
    },
    exclamation: {
        leftPadding: 5,
    }
} as const;

interface Measurement {
    li: HTMLElement;
    svg: SVGElement;
    liWidth: number;
    lineStartXps: number;
    halfLineBoundary: number;
    liRectWidth: number;
}

export function positionDiamondBatch(items: HTMLElement[]): void {
    const LEFT_BOUNDARY = ITEM_LAYOUT.image.paddingLeft + ITEM_LAYOUT.image.width + ITEM_LAYOUT.image.paddingRight;

    const measurements: Measurement[] = [];

    // read phase
    for (const li of items) {
        const measurement = getMeasurement(li);
        if (!measurement) continue;
        measurements.push(measurement);
    }

    // write phase
    for (const { svg, lineStartXps, halfLineBoundary, liRectWidth } of measurements) {
        const rightBoundaryDiamond = lineStartXps + halfLineBoundary;

        // setRightDiamond, inlined as a pure write
        svg.querySelector<SVGGElement>('.diamond-group-r')
        ?.setAttribute('transform', `translate(${liRectWidth}, 0)`);

        // setRSSLink, inlined as a pure write
        setRSSLinkWriteOnly(svg, { left: LEFT_BOUNDARY, right: rightBoundaryDiamond });
    }
}

function setRSSLinkWriteOnly(svg: SVGElement, boundaries: { left: number; right: number }): void {
    const availableWidth = boundaries.right - boundaries.left;
    const centerX = boundaries.left + availableWidth / 2;
    const size = Math.max(
        ITEM_LAYOUT.diamond.minSize,
        Math.min(ITEM_LAYOUT.diamond.maxSize, availableWidth / ITEM_LAYOUT.diamond.sizeRatioDivisor)
    );

    svg.querySelector<SVGGElement>('.diamond-group-line')?.setAttribute('transform', `translate(${centerX}, ${ITEM_LAYOUT.diamond.centerY})`);
    svg.querySelector<SVGPolygonElement>('.line-diamond')?.setAttribute('points', diamondCoord(size).positionLeft);
}
function getMeasurement(li: HTMLElement): Measurement | false {
    const svg = li.querySelector<SVGElement>('.hermidata-item-svg');
    const liWidth = li.offsetWidth;
    if (!svg || liWidth === 0) return false;

    const lineBend = svg.querySelector<SVGLineElement>('.line-top-left-bend');
    const lineStartX = lineBend?.getAttribute('x1');
    if (!lineStartX) return false;

    const lineStartXps = li.clientWidth / parseFloat(lineStartX.replace('%', ''));
    const lineBendRect = lineBend?.getBoundingClientRect();
    if (!lineBendRect?.width || !lineBendRect.height) return false;

    const halfLineBoundary = lineBendRect.width / 2 || Math.sqrt(lineBendRect.height ** 2 + lineBendRect.width ** 2);
    const liRect = li.getBoundingClientRect();
    const liRectWidth = liRect.right - liRect.left;

    return { li, svg, liWidth, lineStartXps, halfLineBoundary, liRectWidth };
}
// needs to be set after sort
export function updatePolygons(): void {
    const NotificationItems = document.querySelectorAll<HTMLElement>('.hermidata-item[data-is-notification-item="true"]');
    const AllItems = document.querySelectorAll<HTMLElement>('.hermidata-item[data-is-notification-item="false"]');

    const triangle = triangleCoord(ITEM_LAYOUT.sides.defaultSize);
    const diamond = diamondCoord(ITEM_LAYOUT.sides.defaultSize);

    const loopTroughItems = (items: NodeListOf<HTMLElement>) => {

        const updates = Array.from(items, (item, index) =>({
            item,
            isFirst: index === 0,
            exclamationPosition: getExclamationPosition(item),
        }));


        for (const {item, isFirst, exclamationPosition} of updates) {

            const polygonLeft = item.querySelector('.diamond-l');
            const polygonRight = item.querySelector('.diamond-r');
            const exclamation = item.querySelector('.notify-rss-link-icon-group');

            exclamation?.setAttribute('transform', `translate(${exclamationPosition}, 8) scale(0.5)`);
            polygonLeft?.setAttribute('points', isFirst ? triangle.positionLeft : diamond.positionLeft);
            polygonRight?.setAttribute('points', isFirst ? triangle.positionRight : diamond.positionRight);
        }
    }

    loopTroughItems(NotificationItems);
    loopTroughItems(AllItems);

    // make notification hidden if needed
    // Fixes bug when opening RSS page and notification svg's are not set
    setTimeout(() => {
        const feedHeaderSymbol = document.querySelector<HTMLElement>('.feed-header-symbol');
        if (!feedHeaderSymbol) return
        const lastDirection = JSON.parse(localStorage.getItem('notificationLastDirection') ?? '"down"');
        feedHeaderSymbol.dataset.feedState = lastDirection;
        
    }, 10);
}
function getExclamationPosition(item: HTMLElement): number {
    const itemRect = item.getBoundingClientRect();
    const chapter = item.querySelector<HTMLElement>('.hermidata-item-chapter');
    const chapterRect = chapter?.getBoundingClientRect();

    if (!chapterRect) {
        return itemRect.width * 0.6 + ITEM_LAYOUT.exclamation.leftPadding;
    }

    // chapterRect.left and itemRect.left are both viewport-relative,
    // so their difference is chapter's offset from item's left edge —
    // equivalent to computed `left` in px, without the getComputedStyle cost.
    const chapterLeft = chapterRect.left - itemRect.left;

    // TEMP fix the temporary offset
    const basicWidth = chapterLeft + chapterRect.width - 50; // 50 is an offset
    return basicWidth + ITEM_LAYOUT.exclamation.leftPadding;
}
function triangleCoord(distanceToPoints: number = ITEM_LAYOUT.sides.defaultSize) {

    let x1 = 0, y1 = 0;
    let x2 = distanceToPoints, y2 = 0;
    let x3 = 0, y3 = distanceToPoints;
    let x4 = -distanceToPoints, y4 = 0;

    const positionTriangleLeft = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`;
    const positionTriangleRight = `${-x1},${y1} ${-x2},${y2} ${-x3},${y3} ${-x4},${y4}`;

    return { positionLeft: positionTriangleLeft, positionRight: positionTriangleRight };
}
function diamondCoord(distanceToPoints: number = ITEM_LAYOUT.sides.defaultSize) {

    let x1 = 0, y1 = -distanceToPoints;
    let x2 = distanceToPoints, y2 = 0;
    let x3 = 0, y3 = distanceToPoints;
    let x4 = -distanceToPoints, y4 = 0;

    const positionLeft = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`;
    const positionRight = `${-x1},${y1} ${-x2},${y2} ${-x3},${y3} ${-x4},${y4}`;

    return { positionLeft: positionLeft, positionRight: positionRight };
}

