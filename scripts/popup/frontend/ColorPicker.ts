import iro from '@jaames/iro';

export class ColorPicker {
    private static colorPicker: iro.ColorPicker | null = null;
    private static hexColor: string | null = null;
    private static colorPickerDiv: HTMLDivElement | null = null;
    private static colorPickerWheel: HTMLDivElement | null = null;
    private static currentCallback: ((color: string) => void) | null = null;
    private static isVisible: boolean = false;
    private static activeAnchor: Element | null = null;

    public static readonly dimensions = { width: 180, height: 240 };

    /**
     * Converts any CSS color format to hex
     * Supports: named colors, rgb(), rgba(), hsl(), hsla(), hex
     */
    private static toHex(color: string): string {
        // If already hex, validate and return
        if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) return color;

        // Create temporary element to let browser convert color
        const temp = document.createElement('div');
        temp.style.color = color;
        document.body.appendChild(temp);
        
        // Get computed color (will be in rgb/rgba format)
        const computedColor = window.getComputedStyle(temp).color;
        document.body.removeChild(temp);

        // Parse rgb/rgba format
        const match = computedColor.match(/\d+/g);
        if (!match || match.length < 3) {
            console.warn(`Invalid color: ${color}, defaulting to #ff0000`);
            return '#ff0000';
        }

        const [r, g, b] = match.map(Number);
        
        // Convert to hex
        const toHexComponent = (n: number) => {
            const hex = n.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHexComponent(r)}${toHexComponent(g)}${toHexComponent(b)}`;
    }

    /** Returns the current hex color */
    public static getHexColor(): string | null {
        return this.hexColor;
    }
    public static isOpen(): boolean {
        return this.isVisible;
    }
    /** Creates the color picker DIV in the DOM */
    private static CreateColorPickerInDOM(): HTMLDivElement {
        if (this.colorPickerDiv) return this.colorPickerDiv;
        
        const element = document.createElement('div');
        element.className = 'colorPicker';
        element.id = 'ColorPicker';
        element.setAttribute('popover', 'manual');

        const header = document.createElement('div');
        header.className = 'colorPicker-header';
        const title = document.createElement('span');
        title.textContent = 'Choose color';
        const wheel = document.createElement('div');
        wheel.className = 'colorPicker-wheel';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'colorPicker-close Btn';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Close color picker');
        closeButton.addEventListener('click', () => this.hide());
        header.append(title, closeButton);
        element.append(header, wheel);

        // Close on click outside
        element.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        document.body.appendChild(element);
        this.colorPickerDiv = element;
        this.colorPickerWheel = wheel;
        return element;
    }
    /** Creates the custom color picker in the DIV colorPicker */
    private static createColorPicker(defaultColor: string): void {
        const element = ColorPicker.CreateColorPickerInDOM();
        const hexColor = ColorPicker.toHex(defaultColor);
        
        if (this.colorPicker) {
            // If picker already exists, just update color
            this.colorPicker.color.hexString = hexColor;
            // Ensure value is at least 50%
            if (this.colorPicker.color.value < 50) this.colorPicker.color.value = 100;
            return;
        }

        if (!this.colorPickerWheel) return;
        this.colorPicker = iro.ColorPicker(this.colorPickerWheel, {
            width: 160,
            color: hexColor,
            layoutDirection: 'vertical',
            layout: [
                {
                    component: iro.ui.Wheel,
                },
                {
                    component: iro.ui.Slider,
                    options: {
                        sliderType: 'value',

                    }
                }
            ]
        });

        this.colorPicker.on('input:end', (color: iro.Color) => {
            this.hexColor = color.hexString;
            if (this.currentCallback) {
                this.currentCallback(color.hexString);
            }
        });

        // Also update on live changes (optional)
        this.colorPicker.on('color:change', (color: iro.Color) => {
            this.hexColor = color.hexString;
        });
    }
    /**
     * - Shows the color picker
     * @param defaultColor - Default color
     * @param callback - Callback function to be called when color is selected
     * @param position - Anchor element or fixed viewport coordinates for the color picker
     */
    public static show( defaultColor: string = '#ffffff',  callback: (color: string) => void, position?: { x: number; y: number } | Element ): void {
        this.createColorPicker(defaultColor);
        if (!this.colorPickerDiv) return;

        if (this.isVisible) this.hide();
        this.currentCallback = callback;
        this.activeAnchor = position instanceof Element ? position : null;

        document.body.appendChild(this.colorPickerDiv);
        this.colorPickerDiv.style.position = 'fixed';
        if (!this.colorPickerDiv.matches(':popover-open')) this.colorPickerDiv.showPopover();
        if (this.activeAnchor) {
            this.positionBesideAnchor(this.activeAnchor);
        } else if (position && !(position instanceof Element)) {
            this.colorPickerDiv.style.left = `${position.x}px`;
            this.colorPickerDiv.style.top = `${position.y}px`;
        }
        this.isVisible = true;
    }
    private static positionBesideAnchor(anchor: Element): void {
        if (!this.colorPickerDiv) return;
        const anchorRect = anchor.getBoundingClientRect();
        const pickerRect = this.colorPickerDiv.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const margin = 8;
        const gap = 8;

        let left = anchorRect.right + gap;
        if (left + pickerRect.width > viewportWidth - margin) left = anchorRect.left - pickerRect.width - gap;
        left = Math.max(margin, Math.min(left, viewportWidth - pickerRect.width - margin));

        let top = anchorRect.top;
        if (top + pickerRect.height > viewportHeight - margin) top = anchorRect.bottom - pickerRect.height;
        top = Math.max(margin, Math.min(top, viewportHeight - pickerRect.height - margin));

        this.colorPickerDiv.style.left = `${left}px`;
        this.colorPickerDiv.style.top = `${top}px`;
    }
    /** Hides the color picker including the callback */
    public static hide(): void {
        if (this.colorPickerDiv) {
            if (this.colorPickerDiv.matches(':popover-open')) this.colorPickerDiv.hidePopover();
            this.isVisible = false;
        }
        this.currentCallback = null;
        this.activeAnchor = null;
    }
    /**
     * - Toggles the color picker
     * @param defaultColor - Default color
     * @param callback - Callback function to be called when color is selected
     * @param position - Position of the color picker
     */
    public static toggle( defaultColor: string, callback: (color: string) => void, position?: { x: number; y: number } | Element ): void {
        if (this.isVisible) this.hide();
        else this.show(defaultColor, callback, position);
    }
    /** Updates the color */
    public static updateColor(color: string): void {
        if (this.colorPicker) this.colorPicker.color.hexString = color;
    }
    /** Destroys the color picker */
    public static destroy(): void {
        // iro doesn't have a destroy method, but we can clean up
        if (this.colorPicker) this.colorPicker = null;
        if (this.colorPickerDiv) {
            this.colorPickerDiv.remove();
            this.colorPickerDiv = null;
        }
        this.colorPickerWheel = null;
        this.currentCallback = null;
        this.activeAnchor = null;
        this.hexColor = null;
        this.isVisible = false;
    }
}