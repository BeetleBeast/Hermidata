





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
    exlamation: {
        leftPadding: 5,
    }
} as const;

const DEBUG = false;

export function positionDiamond(li: HTMLElement): void {
    // Derived constant — left boundary is always image paddingLeft + width + paddingRight
    const LEFT_BOUNDARY = ITEM_LAYOUT.image.paddingLeft + ITEM_LAYOUT.image.width + ITEM_LAYOUT.image.paddingRight;

    // left side diamond
    const svg = li.querySelector<SVGElement>('.hermidata-item-svg');
    const liWidth = li.offsetWidth;
    if (!svg || liWidth === 0) return;

    
    const lineBend = svg.querySelector<SVGLineElement>('.line-top-left-bend');
    const lineStartX = lineBend?.getAttribute('x1');
    if (!lineStartX) return;

    
    const lineStartXps = li.clientWidth / parseFloat(lineStartX.replace('%', ''));
    const lineBendRect = lineBend?.getBoundingClientRect();
    if (!lineBendRect?.width || !lineBendRect.height) return;

    const HalfLineBoundary =  lineBendRect.width / 2 || Math.sqrt(lineBendRect.height **2 + lineBendRect.width **2);

    const rightBoundaryDiamond = lineStartXps + HalfLineBoundary;

    // set-up the right diamond position
    setRightDiamond(li, svg);
    
    // set-up the RSS-link indicator size and position
    setRSSLink(svg, {left: LEFT_BOUNDARY, right: rightBoundaryDiamond});
}
// needs to be set after sort
export function updatePolygons(): void {
    const NotificationItems = document.querySelectorAll<HTMLElement>('.hermidata-item[data-is-notification-item="true"]');
    const AllItems = document.querySelectorAll<HTMLElement>('.hermidata-item[data-is-notification-item="false"]');

    const triangle = triangleCoord(ITEM_LAYOUT.sides.defaultSize);
    const diamond = diamondCoord(ITEM_LAYOUT.sides.defaultSize);

    const loopTroughItems = (items: NodeListOf<HTMLElement>) => {
        for (const item of items) {
            const isFirst = Array.from(items).indexOf(item) === 0;
            const polygonLeft = item.querySelector('.diamond-l');
            const polygonRight = item.querySelector('.diamond-r');
            const exclamation = item.querySelector('.notify-rss-link-icon-group');
        
            const exclamationPosition = getExlamationPosition(item);

            exclamation?.setAttribute('transform', `translate(${exclamationPosition}, 8) scale(0.5)`);

            polygonLeft?.setAttribute('points', isFirst ? triangle.positionLeft : diamond.positionLeft);
            polygonRight?.setAttribute('points', isFirst ? triangle.positionRight : diamond.positionRight);
        }
    }

    loopTroughItems(NotificationItems);
    loopTroughItems(AllItems);
}
function getExlamationPosition(item: HTMLElement): number {
    const itemRect = item.getBoundingClientRect();
    const chapter = item.querySelector<HTMLElement>('.hermidata-item-chapter');
    const chapterWidth = chapter?.getBoundingClientRect().width;

    const chapterLeft = chapter ? window.getComputedStyle(chapter).left : null;
    if (!chapterLeft || !chapterWidth) return itemRect.width * 0.6 + ITEM_LAYOUT.exlamation.leftPadding;
    
    // TEMP fix the temparary offset
    const basicWidth = Number.parseFloat(chapterLeft?.replace('px', '')) + chapterWidth - 50; // 50 is an offset 

    const exclamationPosition = basicWidth + ITEM_LAYOUT.exlamation.leftPadding;

    return exclamationPosition;
}
function setRightDiamond(li: HTMLElement, svg: SVGElement): void {
    const liRect = li.getBoundingClientRect();
    const liWidth = liRect.right - liRect.left;
    // Move the diamond group to the right position
    svg.querySelector<SVGGElement>('.diamond-group-r')?.setAttribute('transform', `translate(${liWidth}, 0)`);
}
function setRSSLink(svg: SVGElement, boundaries: { left: number, right: number }): void {
    // Available space for the diamond
    const availableWidth = boundaries.right - boundaries.left;
    
    const centerX = boundaries.left + availableWidth / 2;

    const size = Math.max(
        ITEM_LAYOUT.diamond.minSize, 
        Math.min(ITEM_LAYOUT.diamond.maxSize, 
        availableWidth / ITEM_LAYOUT.diamond.sizeRatioDivisor 
    ));


    // Update diamond group position
    svg.querySelector<SVGGElement>('.diamond-group-line')?.setAttribute('transform', `translate(${centerX}, ${ITEM_LAYOUT.diamond.centerY})`);

    // Update diamond points relative to 0,0 inside the group
    svg.querySelector<SVGPolygonElement>('.line-diamond')?.setAttribute('points', diamondCoord(size).positionLeft);

    if (DEBUG) drawDebugLines(svg, boundaries.left, boundaries.right);
}
function drawDebugLines(svg: SVGElement, leftBoundaryDiamond: number, rightBoundaryDiamond: number): void {
    // Draw debug lines for boundaries
    const existingLeftLine = svg.querySelector('.debug-left-line');
    const existingRightLine = svg.querySelector('.debug-right-line');
    if (!existingLeftLine) {
        const leftLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        leftLine.setAttribute('class', 'debug-left-line hermidata-item-lines');
        leftLine.setAttribute('x1', String(leftBoundaryDiamond));
        leftLine.setAttribute('y1', '0');
        leftLine.setAttribute('x2', String(leftBoundaryDiamond));
        leftLine.setAttribute('y2', '100%');
        svg.appendChild(leftLine);
    }
    if (!existingRightLine) {
        const rightLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        rightLine.setAttribute('class', 'debug-right-line hermidata-item-lines');
        rightLine.setAttribute('x1', String(rightBoundaryDiamond));
        rightLine.setAttribute('y1', '0');
        rightLine.setAttribute('x2', String(rightBoundaryDiamond));
        rightLine.setAttribute('y2', '100%');
        svg.appendChild(rightLine);
    }
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

