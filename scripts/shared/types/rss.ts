import type { AllHermidata } from "./popup";

export type NormalSortsType = 'Alphabet' | 'Novel-Type' | 'Recently-Added' | 'Latest-Updates';
export type ExeptionSortsType = '';
export type ReverseAllsortsType = `Reverse-${NormalSortsType}`;

export type AllsortsType = (NormalSortsType | ReverseAllsortsType) | ExeptionSortsType;

export type MenuOption = {
    label: string;
    action: () => void | Promise<void>;
}
export type subMenu = {
    label: string;
    options: MenuOption[];
}

export type MenuOptions = MenuOption | separator | subMenu;
export type separator = "separator";

export type Filters = {
    include: Record<string, string[]>; // { type: ['Manga'], status: ['Ongoing'] }
    exclude: Record<string, string[]>;
    sort: AllsortsType;
}

export interface FilterName {
    Sort: string,
    Type: string,
    Status: string,
    NovelStatus: string,
    Source: string,
    Tag: string,
    Date: string
}
export interface FilterClassName {
    [key: string]: string;
    Sort: string,
    Type: string ,
    Status: string ,
    NovelStatus: string,
    Source: string,
    Tag: string,
    Date: string,
}

export type RSSDOM = {
    notifications: {
        items: DocumentFragment;
    };
    allItems: {
        header: DocumentFragment;
        items: DocumentFragment;
    }
}
export type RSSData = {
    feeds: AllHermidata; // this one has RSS the other is all
    hermidata: AllHermidata;
}