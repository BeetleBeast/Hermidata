import type { HermidataImageSource } from "../types/index";

/** A title without an image shows this icon */
const PLACEHOLDER_FILE = 'icon48.png';

/** True for an image the user or a site gave the title: one stored in the browser, or a link that is not the placeholder icon */
export function hasRealImage(image: HermidataImageSource | undefined): boolean {
    if (!image) return false;
    return image.kind === 'stored' || (!!image.url && !image.url.endsWith(PLACEHOLDER_FILE));
}
