import { findNestedFolder, getBookmarkChildren } from "../../background/bookmarks";
import type { AnyNovelType, Bookmark, Hermidata, ReleaseSchedule } from "../types";
import { findByTitleOrAlt, getChapterFromTitle, returnBookmarkHash, returnHashedTitle, TrimTitle } from "./StringOutput";


export class AutoSetAllHermidata {

    private readonly allHermidata: Record<string, Hermidata>;
    private readonly allNovelTypes: AnyNovelType[];

    constructor(allHermidata: Record<string, Hermidata>, allNovelTypes: AnyNovelType[]) {
        this.allHermidata = allHermidata;
        this.allNovelTypes = allNovelTypes;
    }


    public async getAllPotentialHermidata(folderPath: string, rootTitle: string): Promise<Hermidata[] | null> {
        // check if there are any bookmarks in the folder
        const folderPaths: string[] = folderPath.split('/').filter(Boolean);
        folderPaths.shift()?.split('/').filter(Boolean);
        const folderId = await findNestedFolder(folderPaths, rootTitle);
        if (!folderId) return null;
        const bookmarks = await this.getBookmarkChildren(folderId);
        if (!bookmarks.length) return null;
        // check if there are any NEW hermidata  ( that haven't been stored yet ) and create new Hermidata's.
        const newPorentialHermidatas = this.getNewHermidata(bookmarks);
        return newPorentialHermidatas;
    }
    /**
     * @param newPorentialHermidatas - a array or a single tuple of the new Type and the hermidata that hasn't been stored yet
     * @returns an array of the new hermidata
     */
    public static async setHermidataType(Hermidata: [AnyNovelType, Hermidata]): Promise<Hermidata>;
    public static async setHermidataType(ListOfHermidata: Array<[AnyNovelType, Hermidata]>): Promise<Hermidata[]>;
    public static async setHermidataType(value: Array<[AnyNovelType, Hermidata]> | [AnyNovelType, Hermidata]): Promise<Hermidata[] | Hermidata> {
        if (Array.isArray(value[0])) {
            const list = value as Array<[AnyNovelType, Hermidata]>;
            const newHermidatas: Hermidata[] = [];
            for (const [type, hermidata] of list) {
                const newHermidata = this.createNewHermidata(hermidata.title, hermidata.chapter.bookmarks[hermidata.chapter.bookmarkInUse].url, new Date(hermidata.meta.added).getTime(), type);
                newHermidatas.push(newHermidata);
            }
            return newHermidatas;
        } else {
            const [type, hermidata] = value as [AnyNovelType, Hermidata];
            const newHermidata = this.createNewHermidata(hermidata.title, hermidata.chapter.bookmarks[hermidata.chapter.bookmarkInUse].url, new Date(hermidata.meta.added).getTime(), type);
            return newHermidata;
        }
    }
    /** get all bookmarks in folder */
    private async getBookmarkChildren(folderId: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
        // 
        return getBookmarkChildren(folderId);
    }
    /** get all hermidata that haven't been stored yet */
    private getNewHermidata(bookmarks: chrome.bookmarks.BookmarkTreeNode[]): Hermidata[] {
        // 1. 
        const hermidatas: Hermidata[] = []
            
        for (const bookmark of bookmarks) {
            
            const rawTitle = bookmark.title;
            const rawUrl = bookmark.url ?? '';

            const trimmedTitle = TrimTitle.trimTitle(rawTitle, rawUrl).title;
            
            // create all posible id with all posible types
            const allPosibleIDs = this.allNovelTypes.map(type => returnHashedTitle(rawTitle, type, rawUrl));
            const allPosibleIDsIncludes = Object.keys(this.allHermidata).find(novelId => allPosibleIDs.includes(novelId));
            if (allPosibleIDsIncludes) continue;
            // also check if there is a novel with the same title.
            const novelFoundByID = Object.values(this.allHermidata).find(novel => novel.title === trimmedTitle);
            if (novelFoundByID) continue;

            const existingHermidata = findByTitleOrAlt(trimmedTitle, this.allHermidata);
            if (existingHermidata) continue;

            const hermidata = AutoSetAllHermidata.createNewHermidata(bookmark.title, bookmark.url, bookmark.dateAdded);

            hermidatas.push(hermidata);
        }

        return hermidatas
    }
    public static releaseSchedule(history: Bookmark["history"]): ReleaseSchedule {
        // get the timestamps from the history and set in Unix time
        const time = history.flatMap(history => new Date(history.at).getTime());

        const uniqueTimes = [...new Set(time)];

        // rounding error 
        const roundedTimes = uniqueTimes.map(time => Math.round(time / 1000));

        // sort the array
        const sortedTimes = roundedTimes.sort((a, b) => a - b);

        const getNumberOfDaysBetweenDates = (a: number, b: number) => Math.floor((b - a) / (1000 * 60 * 60 * 24));

        // get the number of days between the dates
        const listOfDaysBetweenDates: number[] = [];
        for (let i = 0; i < sortedTimes.length - 1; i++) {
            listOfDaysBetweenDates.push(getNumberOfDaysBetweenDates(sortedTimes[i], sortedTimes[i + 1]));
        }

        // get the average number of days between the dates
        const averageDaysBetweenDates = listOfDaysBetweenDates.reduce((a, b) => a + b, 0) / listOfDaysBetweenDates.length;
        

        // 1. if the dates are about 1 week apart, return weakly
        if (averageDaysBetweenDates < 7) return 'Weekly';
        // 2. if the dates are about 1 month apart, return monthly
        if (averageDaysBetweenDates < 30) return 'Monthly';
        // 3. if the dates are about 1 year apart, return yearly
        if (averageDaysBetweenDates < 365) return 'Yearly';
        // 5. if the dates are about 1 day apart, return daily
        if (averageDaysBetweenDates < 2) return 'Daily';
        // 6. if there is only one date, return 'Once'
        if (sortedTimes.length === 1) return 'Once';
        // 4. if the dates are irregular, return 'irregular'
        if (averageDaysBetweenDates > 365) return 'Irregular';
        // return unknown
        return 'Unknown';
    }

    private static createNewHermidata(title: string, url: string | undefined, dateAdded: number | undefined, novelType: AnyNovelType = 'Manga'): Hermidata {
        // true data
        const rawTitle = title;
        const rawUrl = url ?? '';
        const date = new Date(dateAdded ?? 0);
        const source = new URL(rawUrl).hostname.replace(/^www\./, '');
        const label = 'Primary';

        // trim version
        const trimmedTitle = TrimTitle.trimTitle(rawTitle, rawUrl).title;
        const chapter = getChapterFromTitle(rawTitle, rawUrl);
        const HermidataID = returnHashedTitle(rawTitle, novelType, rawUrl);
        const BookmarkID = returnBookmarkHash(label);

        const bookmarkGuess: Bookmark = {
            version: 4,
            id: BookmarkID,
            current: chapter,
            history: [
                {
                    chapter: chapter,
                    at: date.toISOString()
                }
            ],
            label: label,
            color: 'blue',
            createdAt: date.toISOString(),
            updatedAt: date.toISOString(),
            note: '',
            isPrimary: true,
            readStatus: 'Viewing',
            scrollPosition: 0,
            url: rawUrl
        }

        const hermidataGuess: Hermidata = {
            version: 11,
            id: HermidataID,
            title: trimmedTitle,
            novelType: novelType,
            source: source,
            chapter: {
                bookmarks: {
                    [bookmarkGuess.id]: bookmarkGuess
                },
                revisitingCount: 0,
                latest: chapter,
                lastChecked: date.toISOString(),
                bookmarkInUse: BookmarkID,
                releaseSchedule: this.releaseSchedule(bookmarkGuess.history)
            },
            rss: null,
            import: null,
            meta: {
                tags: [],
                notes: '',
                altTitles: [trimmedTitle, rawTitle],
                altSources: [source],
                added: date.toISOString(),
                updated: date.toISOString(),
                originalRelease: null,
                novelStatus: 'Ongoing',

                contentRating: "Safe",
                contentWarnings: [],
                starRating: 5.0,
                image: '../../../assets/icon/icon48.png',

                readingQueue: false,
                relations: "None"
            }
        }
        return hermidataGuess;
    }
}