// scripts/content/toast.ts
// No imports: content scripts can't load ES-module chunks.

export interface ToastRuntimeMessage {
    action: 'SHOW_TOAST';
    message: string;
    closeAfterMs: number
};

export class Toast {

    private static readonly HOST_ID = '__hermidata_toast_host__';

    private static readonly hidden = { opacity: 0, transform: 'translateY(-8px)' };
    private static readonly shown  = { opacity: 1, transform: 'none' };


    public static show(message: string, closeAfterMs: number) {
        
        // replace any existing toast
        this.removeToast();

        const host = this.setHost();

        const el = this.buildToast(host, message, closeAfterMs);

        this.setAnimation(host, el, closeAfterMs);
    };


    private static removeToast() {
        document.getElementById(this.HOST_ID)?.remove();
    }
    private static setHost(): HTMLElement {
        const host = document.createElement('div');
        host.id = this.HOST_ID;
        return host;
    }
    private static buildToast(host: HTMLElement, message: string, closeAfterMs: number): HTMLElement {
        const el = this.buildElement(message);
        host.attachShadow({ mode: 'closed' }).appendChild(el);
        document.documentElement.appendChild(host);
        return el;
    }
    private static setAnimation(host: HTMLElement, el: HTMLElement, closeAfterMs: number) {
        el.animate([this.hidden, this.shown], { duration: 200, easing: 'ease-out' });

        let timer: ReturnType<typeof setTimeout>;
        const dismiss = () => {
            clearTimeout(timer);
            void this.dismiss(el, host);
        };

        el.addEventListener('click', dismiss, { once: true });
        timer = setTimeout(dismiss, closeAfterMs);
    }

    private static buildElement(message: string): HTMLElement {
        const el = document.createElement('div');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.textContent = message; // textContent, never innerHTML

        Object.assign(el.style, {
            all: 'initial',          // keep first
            position: 'fixed',
            top: '16px',
            right: '16px',
            zIndex: '2147483647',
            maxWidth: '360px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#1f2937',
            color: '#f9fafb',
            font: '14px/1.4 system-ui, sans-serif',
            boxShadow: '0 4px 16px rgba(0,0,0,.35)',
            cursor: 'pointer',
        });

        return el;
    }
    private static async dismiss(div: HTMLElement, host: HTMLElement) {
        await div.animate([this.shown, this.hidden], {
            duration: 200,
            easing: 'ease-in',
            fill: 'forwards', // stay hidden until removal, no flash back to visible
        }).finished;
        host.remove();
    }
};