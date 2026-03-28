// scripts/shared/titleUtils.test.ts
import { describe, it, expect } from 'vitest'
import { TrimTitle, getChapterFromTitle, getTitleAndChapterFromUrl } from '../scripts/shared/StringOutput';

// TODO: test urls'

describe('trimTitle', () => {
    it.each([
        [`Destiny Unchain Online chapter 99 - Read Manga Online`, `Destiny Unchain Online`],
        [`Chapter 222: Illythia's Mission - The Wandering Fairy [LitRPG World-Hopping] | Royal Road`, 'The Wandering Fairy [LitRPG World-Hopping]'],
        [`Chapter 1 | My Villainous Family Won't Let Me Be | Weeb Central`, `My Villainous Family Won't Let Me Be`],
        [`Chapter 98 | Destiny Unchain Online Remake | Weeb Central`, `Destiny Unchain Online Remake`],
        [`Manga: The Maid is a Vampire Chapter - 15-eng-li`, `The Maid is a Vampire`],
        [`The Novel's Extra chapter 150 - Read Manga Online`, `The Novel's Extra`],
        [`Lord of the Mysteries (2025) chapter 3 - Read Manga Online`, `Lord of the Mysteries (2025)`],
        [`The 100th Regression of the Max-Level Player chapter 81 - Read Manga Online`, `The 100th Regression of the Max-Level Player`],
        [`Was Manager Seo Disposed of as an Industrial Accident? chapter 1 - Read Manga Online`, `Was Manager Seo Disposed of as an Industrial Accident?`],
        [`My 990 Thousand Past Lives Help Me chapter 79 - Read Manga Online`, `My 990 Thousand Past Lives Help Me`],
        [`Rebirth ( 69michi) chapter 2 - Read Manga Online`, `Rebirth ( 69michi)`],
        [`Lord of the Mysteries #Chapter 544 - Expert - Read Lord of the Mysteries Chapter 544 - Expert Online - All Page - Novel Bin`, `Lord of the Mysteries`],
        [`Slime Reader Volume 20 - Edited MTL`, `Slime Reader`],
        ["Prologue - My Hero Academia", "My Hero Academia"],
        ["One Piece - Chapter 0: Strong World", "One Piece"],
        ["One Piece - Chapter 1000.5", "One Piece"],
        ["Berserk Chapter 83.5 - Lost Children", "Berserk"],
        ["Chapter 10B - The Return", "The Return"],
        ["Attack on Titan - 139a", "Attack on Titan"],
        ["Vol.3 Chapter 12 - The Fight", "The Fight"],
        ["Volume 2, Chapter 5: Revenge", "Revenge"],
        ["86 - Eighty Six - Chapter 12", "Eighty Six"],
        ["Re:Zero - Chapter 3: Truth of Zero - Part 7", "Re:Zero"],
        ["Mushoku Tensei - 001", "Mushoku Tensei"],
        ["The 100 Girlfriends - Chapter 4", "The 100 Girlfriends"],
        ["One Punch Man - Bonus Chapter", "One Punch Man"],
        ["Extras - Behind the Scenes", "Extras"],
        ["Index", "Index"],
        ["My Title • Chapter 12", "My Title"], // → 12 or NaN? (bullet not in your split regex)
        ["Title／Chapter 12", "Title"], // → 12 or NaN? (fullwidth slash)
        ["Title　Chapter 12", "Title"], // → 12 or NaN? (ideographic space)
    ])('TrimTitle.trimTitle(%s) → %s', (input, expected) => {
        expect(TrimTitle.trimTitle(input, '').title).toBe(expected)
    })
})

describe('trimtitle notes', () => {
    it.each([
        [`Chapter 222: Illythia's Mission - The Wandering Fairy [LitRPG World-Hopping] | Royal Road`, `Chapter Title: Illythia's Mission`],
        [`Rebirth ( 69michi) chapter 2 - Read Manga Online`, ``],
        [`Lord of the Mysteries #Chapter 544 - Expert - Read Lord of the Mysteries Chapter 544 - Expert Online - All Page - Novel Bin`, `Chapter Title: Expert`],
    ])('TrimTitle.trimTitle(%s) → %s', (input, expected) => {
        expect(TrimTitle.trimTitle(input, '').note).toBe(expected)
    })
});


describe('getChapterFromTitle', () => {
    it.each([
        [`Destiny Unchain Online chapter 99 - Read Manga Online`, 99],
        [`Chapter 222: Illythia's Mission - The Wandering Fairy [LitRPG World-Hopping] | Royal Road`, 222],
        [`Chapter 1 | My Villainous Family Won't Let Me Be | Weeb Central`, 1],
        [`Chapter 98 | Destiny Unchain Online Remake | Weeb Central`, 98],
        [`Manga: The Maid is a Vampire Chapter - 15-eng-li`, 15],
        [`The Novel's Extra chapter 150 - Read Manga Online`, 150],
        [`Lord of the Mysteries (2025) chapter 3 - Read Manga Online`, 3],
        [`The 100th Regression of the Max-Level Player chapter 81 - Read Manga Online`, 81],
        [`Was Manager Seo Disposed of as an Industrial Accident? chapter 1 - Read Manga Online`, 1],
        [`My 990 Thousand Past Lives Help Me chapter 79 - Read Manga Online`, 79],
        [`Rebirth ( 69michi) chapter 2 - Read Manga Online`, 2],
        ["Prologue - My Hero Academia", Number.NaN],
        ["One Piece - Chapter 0: Strong World", 0],
        ["One Piece - Chapter 1000.5", 1000.5],
        ["Berserk Chapter 83.5 - Lost Children", 83.5],
        ["Chapter 10B - The Return", 10],
        ["Attack on Titan - 139a", 139],
        ["Vol.3 Chapter 12 - The Fight", 12],
        ["Volume 2, Chapter 5: Revenge", 5],
        ["86 - Eighty Six - Chapter 12", 12],
        ["Re:Zero - Chapter 3: Truth of Zero - Part 7", 3],
        ["Mushoku Tensei - 001", 0o1],
        ["The 100 Girlfriends - Chapter 4", 4],
        ["One Punch Man - Bonus Chapter", Number.NaN],
        ["Extras - Behind the Scenes", Number.NaN],
        ["Index", Number.NaN],
        ["My Title • Chapter 12", 12], // → 12 or NaN? (bullet not in your split regex)
        ["Title／Chapter 12", 12], // → 12 or NaN? (fullwidth slash)
        ["Title　Chapter 12", 12], // → 12 or NaN? (ideographic space)
        ["第12話 - Title", 12], // → NaN (Japanese episode marker)
        ["화 12 - Title", 12], // → NaN (Korean)
        ["One Piece - Chapter 1107", 1107], // → 1107 (your regex caps at \d{1,5} so fine)
        ["Tower of God - Chapter 10000", 10000] //  → NaN (5 digits, doesn't exceeds \d{1,5})
    ])('getChapterFromTitle(%s) → %s', (input, expected) => {
        expect(getChapterFromTitle(input, '')).toBe(expected)
    })
})

describe('getTitleAndChapterFromUrl', () => {
    it.each([
        ['SSS-Class Revival Hunter - Chapter 154', {title: `SSS-Class Revival Hunter`, chapter: 154}],
        ['https://mangafire.to/read/sss-class-suicide-hunterr.krq9/en/chapter-154', {title: `SSS-Class Revival Hunter`, chapter: 154}],
        [`www.destinyunchain.online/chapter/222`, {title: `The Wandering Fairy [LitRPG World-Hopping]`, chapter: 222}],
        [`www.destinyunchain.online/chapter/1`, {title: `My Villainous Family Won't Let Me Be`, chapter: 1}],
        [`www.destinyunchain.online/chapter/98`, {title: `Destiny Unchain Online Remake`, chapter: 98}],
        [`www.destinyunchain.online/chapter/15`, {title: `The Maid is a Vampire`, chapter: 15}],
        [`www.destinyunchain.online/chapter/150`, {title: `The Novel's Extra`, chapter: 150}],
        [`www.destinyunchain.online/chapter/3`, {title: `Lord of the Mysteries (2025)`, chapter: 3}],
        ])('getTitleAndChapterFromUrl(%s) → %s', (input, expected) => {
        expect(getTitleAndChapterFromUrl(input)).toBe(expected)
    })
})
getTitleAndChapterFromUrl