import iro from '@jaames/iro';

export class ColorPicker {
    private static colorpicker: iro.ColorPicker | null = null;
    private static hexColor: string | null = null;
    private static colorPickerDiv: HTMLDivElement | null = null;
    private static currentCallback: ((color: string) => void) | null = null;
    private static isVisible: boolean = false;

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
    private static createColorPicker(defaultColor: string = '#ffffff'): void {
        const element = ColorPicker.CreateColorPickerInDOM();
        
        if (this.colorpicker) {
            // If picker already exists, just update color
            this.colorpicker.color.hexString = defaultColor;
            return;
        }

        this.colorpicker = iro.ColorPicker(element, {
            width: 200,
            color: defaultColor,
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
            //this.hexColor = color.hexString;
        });
    }
    /**
     * - Shows the color picker
     * @param defaultColor - Default color
     * @param callback - Callback function to be called when color is selected
     * @param position - Position of the color picker
     */
    public static show( defaultColor: string,  callback: (color: string) => void, position?: { x: number; y: number } ): void {
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