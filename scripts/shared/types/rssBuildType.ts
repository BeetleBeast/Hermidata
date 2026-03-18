export type AllsortsType = 'Alphabet' | 'Recently-Added' | 'Latest-Updates';
export const AllSorts: AllsortsType[] = (['Alphabet', 'Recently-Added', 'Latest-Updates'])



export type MenuOption = {
    label: string;
    action: () => void | Promise<void>;
}
export type separator = "separator";