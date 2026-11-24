/** Cover shape used across the app ( library cards and the detail page ): 5 wide by 7 high */
const COVER_ASPECT = 5 / 7;
/** Saved crops are at most this wide; a smaller crop keeps its own size instead of being blown up */
const OUTPUT_WIDTH = 500;
const MAX_ZOOM = 4;
const KEY_STEP = 10;
const KEY_STEP_LARGE = 40;
const ZOOM_STEP = 1.1;

/**
 * Lets the user pick the part of an image that becomes the cover. The image always covers the 5:7 frame
 * ( no empty edges ); it is moved by dragging or the arrow keys and zoomed with the wheel, the slider or + / -.
 */
export class CoverCropper {

    private readonly frame: HTMLElement;
    private readonly image: HTMLImageElement;
    private readonly zoom: HTMLInputElement;

    private objectUrl: string | null = null;
    private naturalWidth = 0;
    private naturalHeight = 0;
    private frameWidth = 0;
    private frameHeight = 0;
    /** Scale at which the image just covers the frame; the slider zooms in from there */
    private minScale = 1;
    private scale = 1;
    /** Position of the image's top left corner inside the frame, in css pixels */
    private x = 0;
    private y = 0;

    private drag: { pointerId: number; lastX: number; lastY: number } | null = null;

    constructor(frame: HTMLElement, image: HTMLImageElement, zoom: HTMLInputElement) {
        this.frame = frame;
        this.image = image;
        this.zoom = zoom;
        this.zoom.min = '1';
        this.zoom.max = String(MAX_ZOOM);
        this.zoom.step = '0.01';
        this.bind();
    }

    /** Show the image, zoomed out to fill the frame and centred. The frame must be visible, it is measured */
    public async load(blob: Blob): Promise<void> {
        this.dispose();
        // an object url keeps the canvas untainted, whatever site the image came from
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrl = objectUrl;
        // wait for load rather than decode(): decode() can stay pending for an image inside a just-opened dialog
        await new Promise<void>((resolve, reject) => {
            this.image.onload = () => resolve();
            this.image.onerror = () => reject(new Error('The file is not an image this browser can read'));
            this.image.src = objectUrl;
        });
        this.naturalWidth = this.image.naturalWidth;
        this.naturalHeight = this.image.naturalHeight;

        // layout size, not the on-screen box: the dialog may still be scaling in
        this.frameWidth = this.frame.clientWidth;
        this.frameHeight = this.frame.clientHeight;
        this.minScale = Math.max(this.frameWidth / this.naturalWidth, this.frameHeight / this.naturalHeight);
        this.scale = this.minScale;
        this.x = (this.frameWidth - this.naturalWidth * this.scale) / 2;
        this.y = (this.frameHeight - this.naturalHeight * this.scale) / 2;
        this.apply();
    }

    /** The framed part of the image, as a new image file */
    public async export(): Promise<Blob> {
        if (!this.naturalWidth) throw new Error('The image is still loading');
        const sourceWidth = this.frameWidth / this.scale;
        const sourceHeight = this.frameHeight / this.scale;
        const width = Math.round(Math.min(OUTPUT_WIDTH, sourceWidth));
        const height = Math.round(width / COVER_ASPECT);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('This browser cannot crop images');
        context.imageSmoothingQuality = 'high';
        context.drawImage(this.image, -this.x / this.scale, -this.y / this.scale, sourceWidth, sourceHeight, 0, 0, width, height);

        // webp keeps covers small; a browser that can't write it gives png instead
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.92));
        if (blob) return blob;
        const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!png) throw new Error('Could not create the cropped image');
        return png;
    }

    public dispose(): void {
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
        this.naturalWidth = 0;
        this.image.removeAttribute('src');
    }

    private bind(): void {
        this.frame.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            this.frame.setPointerCapture(event.pointerId);
            this.drag = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
            this.frame.dataset.dragging = 'true';
        });
        this.frame.addEventListener('pointermove', (event) => {
            if (!this.drag || event.pointerId !== this.drag.pointerId) return;
            this.moveBy(event.clientX - this.drag.lastX, event.clientY - this.drag.lastY);
            this.drag.lastX = event.clientX;
            this.drag.lastY = event.clientY;
        });
        const endDrag = () => {
            this.drag = null;
            delete this.frame.dataset.dragging;
        };
        this.frame.addEventListener('pointerup', endDrag);
        this.frame.addEventListener('pointercancel', endDrag);

        this.frame.addEventListener('wheel', (event) => {
            event.preventDefault();
            const box = this.frame.getBoundingClientRect();
            this.zoomTo(this.scale / this.minScale * Math.exp(-event.deltaY * 0.0015), event.clientX - box.left, event.clientY - box.top);
        }, { passive: false });

        this.frame.addEventListener('keydown', (event) => {
            const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
            const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
            const zoom = this.scale / this.minScale;
            if (moves[event.key]) this.moveBy(...moves[event.key]);
            else if (event.key === '+' || event.key === '=') this.zoomTo(zoom * ZOOM_STEP);
            else if (event.key === '-') this.zoomTo(zoom / ZOOM_STEP);
            else return;
            event.preventDefault();
        });

        this.zoom.addEventListener('input', () => this.zoomTo(Number(this.zoom.value)));
    }

    /** Arrow keys move the visible part, so the image itself moves the other way */
    private moveBy(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;
        this.apply();
    }

    /** Zoom to `zoom` times the fill scale, keeping the point under ( cx, cy ) in place ( the centre by default ) */
    private zoomTo(zoom: number, cx = this.frameWidth / 2, cy = this.frameHeight / 2): void {
        if (!this.naturalWidth) return;
        const next = this.minScale * Math.min(MAX_ZOOM, Math.max(1, zoom));
        this.x = cx - (cx - this.x) * next / this.scale;
        this.y = cy - (cy - this.y) * next / this.scale;
        this.scale = next;
        this.apply();
    }

    /** Keep the frame covered, then draw */
    private apply(): void {
        if (!this.naturalWidth || !this.frameWidth) return; // nothing loaded yet: ignore early input
        const width = this.naturalWidth * this.scale;
        const height = this.naturalHeight * this.scale;
        this.x = Math.min(0, Math.max(this.frameWidth - width, this.x));
        this.y = Math.min(0, Math.max(this.frameHeight - height, this.y));

        this.image.style.width = `${width}px`;
        this.image.style.height = `${height}px`;
        this.image.style.transform = `translate(${this.x}px, ${this.y}px)`;
        this.zoom.value = String(this.scale / this.minScale);
    }
}
