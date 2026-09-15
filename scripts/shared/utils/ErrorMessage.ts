

abstract class Messaging {

    protected messageBuilder: BuildElement;

    protected message: string = 'An error occurred, please try again.';



    constructor(message?: string, elements?: Partial<ErrorElements>) {
        this.message = this.message ?? message;
        this.messageBuilder = new BuildElement(elements);
    }

    public abstract sendMessage(): void


    protected abstract colourMessage(): void

}

class Message extends Messaging {

    private colour: string = 'var(--accent-dark)';

    constructor(message?: string, elements?: Partial<ErrorElements>) {
        super(message, elements);
    }

    public sendMessage(messageColour?: string) {
        this.message ??= 'this option is not available, please try again.';

        this.colourMessage(messageColour);


        this.setMessageContent();

        this.messageBuilder.show();
    }

    protected colourMessage(messageColour?: string): void {
        this.colour = messageColour ?? this.colour;
    }

    private setMessageContent() {
        this.messageBuilder.message.textContent = this.message;
        this.messageBuilder.message.style.color = this.colour;
    }
    private 

}

class WarningMessage extends Messaging {
    public sendMessage(): void {
        throw new Error("Method not implemented.");
    }
    protected colourMessage(): void {
        throw new Error("Method not implemented.");
    }


}

class ErrorMessage extends Messaging {
    protected colourMessage(): void {
        throw new Error("Method not implemented.");
    }

    public sendMessage(message?: string) {
        message ??= 'An error occurred, please try again.';
    }

}

class ConsoleMessage extends Messaging {
    public sendMessage(): void {
        throw new Error("Method not implemented.");
    }
    protected colourMessage(): void {
        throw new Error("Method not implemented.");
    }
    
}


interface ErrorElements {
    container: HTMLDivElement;
    message: HTMLDivElement;
    accept_Button: HTMLButtonElement;
}

class BuildElement {

    private readonly container: HTMLDivElement;

    public readonly message: HTMLDivElement;
    
    public readonly accept_Button: HTMLButtonElement;


    constructor(elements?: Partial<ErrorElements>) {
        this.container = elements?.container ?? this.createElements('container');
        this.message = elements?.message ?? this.createElements('message');
        this.accept_Button = elements?.accept_Button ?? this.createElements('accept_Button');
    }



    public show() {

        this.setElementDisplay('visible');

    }

    public hide() {

        this.setElementDisplay('hidden');
    }

    private setElementDisplay(setVisility: 'visible' | 'hidden') {
        this.container.style.display = setVisility === 'visible' ? 'flex' : 'none';
    }

    private createElements<T extends keyof ErrorElements>(element: T): ErrorElements[T] {
        switch(element) {
            case 'container':
                return this.createElement(element, 'div', ['error-message-container', 'error-message'], '');
            case 'message':
                return this.createElement(element, 'div', ['error-message-text', 'error-message'], '');
            case 'accept_Button':
                return this.createElement(element, 'button', ['error-message-button', 'error-message'], 'Accept');
        }
    }
    private createElement<T extends keyof ErrorElements>(key: T, element: 'div' | 'button', classes: string[], textContent: string): ErrorElements[T] {
        const div = document.createElement(element) as ErrorElements[T];
        div.classList.add(...classes);
        if (element === 'button') {
            (div as HTMLButtonElement).type = 'button';
        }
        div.textContent = textContent;
        return div;
    }

}