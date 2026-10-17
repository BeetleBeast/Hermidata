export type ConsoleLevel = 'log' | 'warn' | 'error' | 'none';
export type MessageSeverity = 'info' | 'warning' | 'error';

/** Controls whether a message is shown to the user and/or written to the console. */
export interface MessageOptions {
    notifyUser: boolean;
    consoleLevel: ConsoleLevel;
    severity: MessageSeverity;
    color: string;
    details?: readonly unknown[];
}

/** Optional existing HTML elements to use for a user-facing notification. */
export interface ErrorElements {
    container: HTMLDivElement;
    message: HTMLDivElement;
    accept_Button: HTMLButtonElement;
}

const DEFAULT_MESSAGE = 'An error occurred, please try again.';
const DEFAULT_COLOR = 'var(--accent-soft, #7896d2)';
let defaultMessageBuilder: BuildElement | undefined;
let messageId = 0;

abstract class Messaging {
    protected message: string;
    protected messageBuilder?: BuildElement;
    protected readonly options: MessageOptions;
    private readonly elements?: Partial<ErrorElements>;

    /** Sets the message text, optional notification elements, and delivery defaults. */
    protected constructor(message?: string, elements?: Partial<ErrorElements>, options?: Partial<MessageOptions>, defaults?: MessageOptions) {
        if (!options) options = {};
        if (!defaults) defaults = {
            notifyUser: true,
            consoleLevel: 'none',
            severity: 'info',
            color: DEFAULT_COLOR
        }

        this.message = message ?? DEFAULT_MESSAGE;
        this.options = { ...defaults, ...options };
        this.elements = elements;
    }

    /** Sends the configured message; subclasses decide whether this updates text or styling. */
    public abstract sendMessage(message?: string): void;

    /** Writes to the selected console channel and displays the notification when enabled. */
    protected send(message?: string): void {
        if (message !== undefined) this.message = message;

        this.sendToConsole();
        if (this.options.notifyUser) {
            if (typeof document === 'undefined' || !document.body) throw new Error('Cannot show a user message before the document body is available.');

            this.messageBuilder ??= this.elements ? new BuildElement(this.elements) : (defaultMessageBuilder ??= new BuildElement());
            this.messageBuilder.show(this.message, this.options.color, this.options.severity);
        }
    }

    private sendToConsole(): void {
        if (this.options.consoleLevel === 'none') {
            return;
        }

        const label = this.options.consoleLevel.toUpperCase();
        const color = this.options.consoleLevel === 'error'
            ? '#b42318'
            : this.options.consoleLevel === 'warn'
                ? '#b54708'
                : '#175cd3';
        const style = `background: ${color}; color: #fff; font-weight: bold; padding: 2px 5px; border-radius: 3px;`;
        const resetStyle = 'color: inherit; background: transparent;';
        const output = [`%c[Hermidata] ${label}%c`, style, resetStyle, this.message, ...(this.options.details ?? [])];

        switch (this.options.consoleLevel) {
            case 'log':
                console.log(...output);
                break;
            case 'warn':
                console.warn(...output);
                break;
            case 'error':
                console.error(...output);
                break;
        }
    }
}

export class Message extends Messaging {
    /** Creates a neutral notification. By default it is shown to the user without console output. */
    constructor(message?: string, elements?: Partial<ErrorElements>, options?: Partial<MessageOptions>) {
        super(message, elements, options);
    }

    /**
     * Shows the configured message, optionally overriding its text color.
     * @example new Message('Saved successfully').sendMessage('#16803c');
     */
    public sendMessage(messageColour?: string): void {
        if (messageColour) {
            this.options.color = messageColour;
        }

        this.send();
    }
}

export class WarningMessage extends Messaging {
    /** Creates a warning notification; it is shown to the user and logged with console.warn by default. */
    constructor(message?: string, elements?: Partial<ErrorElements>, options: Partial<MessageOptions> = {}) {
        super(message, elements, options, {
            notifyUser: true,
            consoleLevel: 'warn',
            severity: 'warning',
            color: 'var(--warning, #caa35a)'
        });
    }

    /**
     * Displays/logs this warning, optionally replacing its message text.
     * @example new WarningMessage('Some settings could not be loaded').sendMessage();
     * @example new WarningMessage().sendMessage('This action cannot be undone.');
     */
    public sendMessage(message?: string): void {
        this.send(message);
    }
}

export class ErrorMessage extends Messaging {
    /** Creates an error notification; it is shown to the user and logged with console.error by default. */
    constructor(message?: string, elements?: Partial<ErrorElements>, options: Partial<MessageOptions> = {}) {
        super(message, elements, options, {
            notifyUser: true,
            consoleLevel: 'error',
            severity: 'error',
            color: 'var(--danger, #c85b5b)'
        });
    }

    /**
     * Displays/logs this error, optionally replacing its message text.
     * @example new ErrorMessage('Could not save your changes').sendMessage();
     */
    public sendMessage(message?: string): void {
        this.send(message);
    }
}

export class ConsoleMessage extends Messaging {
    /** Creates a console-only warning by default; set notifyUser to true to also display it to the user. */
    constructor(message?: string, elements?: Partial<ErrorElements>, options: Partial<MessageOptions> = {}) {
        super(message, elements, options, {
            notifyUser: false,
            consoleLevel: 'warn',
            severity: 'warning',
            color: 'var(--warning, #caa35a)'
        });
    }

    /**
     * Logs the message without displaying a notification by default.
     * @example new ConsoleMessage('Retrying request', undefined, { details: [error] }).sendMessage();
     * @example new ConsoleMessage('Unexpected response', undefined, { consoleLevel: 'error' }).sendMessage();
     */
    public sendMessage(message?: string): void {
        this.send(message);
    }
}

class BuildElement {
    private readonly dialog: HTMLDialogElement;
    public readonly container: HTMLDivElement;
    public readonly message: HTMLDivElement;
    public readonly accept_Button: HTMLButtonElement;

    /** Creates or adopts the notification elements and configures their basic styles and dismissal. */
    constructor(elements?: Partial<ErrorElements>) {
        this.dialog = document.createElement('dialog');
        this.dialog.classList.add('error-message-dialog');
        this.dialog.addEventListener('click', (event) => event.stopPropagation());
        this.container = elements?.container ?? this.createElement('div', 'error-message-container');
        this.message = elements?.message ?? this.createElement('div', 'error-message-text');
        this.accept_Button = elements?.accept_Button ?? this.createElement('button', 'error-message-button');

        if (!this.container.contains(this.message)) this.container.append(this.message);
        if (!this.container.contains(this.accept_Button)) this.container.append(this.accept_Button);
        this.dialog.append(this.container);
        this.message.id ||= `error-message-${++messageId}`;
        this.dialog.setAttribute('aria-labelledby', this.message.id);

        this.accept_Button.type = 'button';
        this.accept_Button.textContent ||= 'Accept';
        this.accept_Button.addEventListener('click', () => this.hide());

        this.container.classList.add('error-message-container');
        this.container.setAttribute('role', 'status');
        this.container.setAttribute('aria-live', 'polite');
        this.dialog.style.position = 'fixed';
        this.dialog.style.padding = '0';
        this.dialog.style.border = '0';
        this.dialog.style.background = 'transparent';
        this.dialog.style.overflow = 'visible';
        this.container.style.maxWidth = 'min(28rem, calc(100vw - 2rem))';
        this.container.style.padding = '1rem';
        this.container.style.backgroundColor = 'var(--surface, #121f31)';
        this.container.style.color = 'var(--text, #d3d3d3)';
        this.container.style.borderRadius = '0.5rem';
        this.container.style.boxShadow = '0 4px 16px var(--shadow, rgb(0 0 0 / 25%))';
        this.container.style.fontFamily = 'system-ui, sans-serif';
        this.container.style.gap = '0.75rem';
        this.container.style.border = 'solid 1px var(--accent-hover-dark)';

        this.accept_Button.style.padding = '0.35rem 0.75rem';
        this.accept_Button.style.color = 'var(--text, #d3d3d3)';
        this.accept_Button.style.border = '1px solid var(--border, #46556e)';
        this.accept_Button.style.borderRadius = 'var(--radius, 6px)';
        this.accept_Button.style.cursor = 'pointer';
    }

    /** Adds the notification to the page if needed, updates its content, and makes it visible. */
    public show(message: string, color: string, severity: MessageSeverity): void {
        if (typeof document === 'undefined' || !document.body) throw new Error('Cannot show a user message before the document body is available.');

        this.message.textContent = message;
        this.message.style.whiteSpace = 'pre-line';
        this.message.style.color = color;
        this.container.style.borderLeft = `4px solid ${color}`;
        this.container.setAttribute('role', severity === 'error' ? 'alert' : 'status');
        this.container.setAttribute('aria-live', severity === 'error' ? 'assertive' : 'polite');

        if (!this.dialog.isConnected) document.body.append(this.dialog);
        if (this.dialog.open) this.dialog.close();
        if (severity === 'error') {
            this.dialog.style.inset = '0';
            this.dialog.style.width = '100%';
            this.dialog.style.height = '100%';
            this.dialog.style.maxWidth = 'none';
            this.dialog.style.maxHeight = 'none';
            this.dialog.style.margin = '0';
            this.dialog.style.transform = '';
            this.container.style.margin = '1rem auto 0';
            this.dialog.showModal();
        } else {
            this.dialog.style.inset = 'auto';
            this.dialog.style.top = '1rem';
            this.dialog.style.left = '50%';
            this.dialog.style.width = 'fit-content';
            this.dialog.style.height = 'auto';
            this.dialog.style.maxWidth = 'min(28rem, calc(100vw - 2rem))';
            this.dialog.style.maxHeight = 'none';
            this.dialog.style.margin = '0';
            this.dialog.style.transform = 'translateX(-50%)';
            this.container.style.margin = '0';
            this.dialog.show();
        }
    }

    /** Hides the notification without removing it from the document. */
    public hide(): void {
        if (this.dialog.open) this.dialog.close();
    }

    /** Creates a notification element and gives it the shared notification CSS classes. */
    private createElement<T extends HTMLDivElement | HTMLButtonElement>(tag: 'div' | 'button', className: string): T {
        const element = document.createElement(tag);
        element.classList.add(className, 'error-message');
        return element as T;
    }
}
