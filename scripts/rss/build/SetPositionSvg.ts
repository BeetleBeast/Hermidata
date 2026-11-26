





const ITEM_LAYOUT = {
    image: {
        paddingLeft: 12,
        width: 40,
        paddingRight: 2,
    },
    diamond: {
        rightBoundaryRatio: 0.125, // 12.5% of the item width, keep in sync with .diamond-group-line in rss-feed.css
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
    svg: SVGElement;
    diamondSize: number;
}

// The diamond sits at 27px + 6.25% of the item width ( see .diamond-group-line in rss-feed.css ), that is the middle
// between the image column and the line bend at 12.5% of the item width.
// Only its size can not be done in CSS: polygon points are not a CSS property and scale() takes no length ratio.
export function positionDiamondBatch(items: HTMLElement[]): void {
    const LEFT_BOUNDARY = ITEM_LAYOUT.image.paddingLeft + ITEM_LAYOUT.image.width + ITEM_LAYOUT.image.paddingRight;

    const measurements: Measurement[] = [];

    // read phase
    for (const li of items) {
        const measurement = getMeasurement(li, LEFT_BOUNDARY);
        if (!measurement) continue;
        measurements.push(measurement);
    }

    // write phase
    for (const { svg, diamondSize } of measurements) {
        svg.querySelector<SVGPolygonElement>('.line-diamond')?.setAttribute('points', diamondCoord(diamondSize).positionLeft);
    }
}

function getMeasurement(li: HTMLElement, leftBoundary: number): Measurement | false {
    const svg = li.querySelector<SVGElement>('.hermidata-item-svg');
    const liWidth = li.clientWidth;
    if (!svg || liWidth === 0) return false;

    // line-top-left-bend runs from 10% to 15% of the width, its half way point is the right boundary
    const availableWidth = liWidth * ITEM_LAYOUT.diamond.rightBoundaryRatio - leftBoundary;
    const diamondSize = Math.max(
        ITEM_LAYOUT.diamond.minSize,
        Math.min(ITEM_LAYOUT.diamond.maxSize, availableWidth / ITEM_LAYOUT.diamond.sizeRatioDivisor)
    );

    return { svg, diamondSize };
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

