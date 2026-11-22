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
        const el = this.buildElement();
        host.attachShadow({ mode: 'closed' }).appendChild(el);
        document.documentElement.appendChild(host);
        // A live region is only announced when its text changes after it is in the page, so the message goes in last
        requestAnimationFrame(() => { el.textContent = message; }); // textContent, never innerHTML
        return el;
    }
    private static setAnimation(host: HTMLElement, el: HTMLElement, closeAfterMs: number) {
        if (!this.prefersReducedMotion()) el.animate([this.hidden, this.shown], { duration: 200, easing: 'ease-out' });

        let timer: ReturnType<typeof setTimeout>;
        const dismiss = () => {
            clearTimeout(timer);
            document.removeEventListener('keydown', onKeyDown, true);
            void this.dismiss(el, host);
        };
        // listens only; the page still receives the key
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };

        el.addEventListener('click', dismiss, { once: true });
        document.addEventListener('keydown', onKeyDown, true);
        // the toast stays while it is hovered, so it can be read at any pace
        el.addEventListener('mouseenter', () => clearTimeout(timer));
        el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, closeAfterMs); });
        timer = setTimeout(dismiss, closeAfterMs);
    }
    private static prefersReducedMotion(): boolean {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    private static buildElement(): HTMLElement {
        const el = document.createElement('div');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-atomic', 'true');

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
        if (this.prefersReducedMotion()) return host.remove();
        await div.animate([this.shown, this.hidden], {
            duration: 200,
            easing: 'ease-in',
            fill: 'forwards', // stay hidden until removal, no flash back to visible
        }).finished;
        host.remove();
    }
};