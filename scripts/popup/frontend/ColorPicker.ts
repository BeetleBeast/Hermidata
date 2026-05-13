import iro from '@jaames/iro';

export class ColorPicker {
    private static colorpicker: iro.ColorPicker | null = null;
    private static hexColor: string | null = null;
    private static colorPickerDiv: HTMLDivElement | null = null;
    private static currentCallback: ((color: string) => void) | null = null;
    private static isVisible: boolean = false;

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
    /** Creates the color picker DIV in the DOM */
    private static CreateColorPickerInDOM(): HTMLDivElement {
        if (this.colorPickerDiv) return this.colorPickerDiv;
        
        const element = document.createElement('div');
        element.className = 'colorPicker';
        element.id = 'ColorPicker';
        element.style.display = 'none'; // Hidden by default
        element.style.position = 'absolute';
        element.style.zIndex = '10000';
        
        // Close on click outside
        element.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        document.body.appendChild(element);
        this.colorPickerDiv = element;
        return element;
    }
    /** Creates the custom color picker in the DIV colorPicker */
    private static createColorPicker(defaultColor: string): void {
        const element = ColorPicker.CreateColorPickerInDOM();
        const hexColor = ColorPicker.toHex(defaultColor);
        
        if (this.colorpicker) {
            // If picker already exists, just update color
            this.colorpicker.color.hexString = hexColor;
            // Ensure value is at least 50%
            if (this.colorpicker.color.value < 50) this.colorpicker.color.value = 100;
            return;
        }

        this.colorpicker = iro.ColorPicker(element, {
            width: 200,
            color: hexColor,
            layoutDirection: 'horizontal',
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

        this.colorpicker.on('input:end', (color: iro.Color) => {
            this.hexColor = color.hexString;
            if (this.currentCallback) {
                this.currentCallback(color.hexString);
            }
        });

        // Also update on live changes (optional)
        this.colorpicker.on('color:change', (color: iro.Color) => {
            this.hexColor = color.hexString;
        });
    }
    /**
     * - Shows the color picker
     * @param defaultColor - Default color
     * @param callback - Callback function to be called when color is selected
     * @param position - Position of the color picker
     */
    public static show( defaultColor: string = '#ffffff',  callback: (color: string) => void, position?: { x: number; y: number } ): void {
        this.createColorPicker(defaultColor);
        this.currentCallback = callback;
        
        if (this.colorPickerDiv) {
            this.colorPickerDiv.style.display = 'block';
            this.isVisible = true;

            // Position near click or center
            if (position) {
                this.colorPickerDiv.style.left = `${position.x}px`;
                this.colorPickerDiv.style.top = `${position.y}px`;
            }
        }

        // Add document click listener to close
        setTimeout(() => {
            document.addEventListener('click', this.handleDocumentClick);
        }, 0);
    }
    /** Hides the custom color picker */
    private static handleDocumentClick = (): void => {
        ColorPicker.hide();
    };
    /** Hides the color picker including the callback */
    public static hide(): void {
        if (this.colorPickerDiv) {
            this.colorPickerDiv.style.display = 'none';
            this.isVisible = false;
        }
        this.currentCallback = null;
        document.removeEventListener('click', this.handleDocumentClick);
    }
    /**
     * - Toggles the color picker
     * @param defaultColor - Default color
     * @param callback - Callback function to be called when color is selected
     * @param position - Position of the color picker
     */
    public static toggle( defaultColor: string, callback: (color: string) => void, position?: { x: number; y: number } ): void {
        if (this.isVisible) this.hide();
        else this.show(defaultColor, callback, position);
    }
    /** Updates the color */
    public static updateColor(color: string): void {
        if (this.colorpicker) this.colorpicker.color.hexString = color;
    }
    /** Destroys the color picker */
    public static destroy(): void {
        // iro doesn't have a destroy method, but we can clean up
        if (this.colorpicker) this.colorpicker = null;
        if (this.colorPickerDiv) {
            this.colorPickerDiv.remove();
            this.colorPickerDiv = null;
        }
        this.currentCallback = null;
        this.hexColor = null;
        this.isVisible = false;
        document.removeEventListener('click', this.handleDocumentClick);
    }
}