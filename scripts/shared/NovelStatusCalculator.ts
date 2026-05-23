import type { AnyNovelStatus, AnyNovelType } from "./types"



export interface CalculateStatusReturnObject {
    EnoughInfo: boolean,
    value: {
        Decision: 'Keep' | 'Change',
        Status: AnyNovelStatus,
        Reason: string,
        InactiveDays: number
        Score: number // percantage of inactive days to next threshold
    } | null
}

export type statusScore = Record<Exclude<AnyNovelStatus, 'Completed'>, Record<AnyNovelType, { numberOfDaysInactive: number, reason?: string }>>

const statusScore: statusScore = {
    Ongoing: {
        Manga: {
            numberOfDaysInactive: 0,
        },
        Manhwa: {
            numberOfDaysInactive: 0,
        },
        Manhua: {
            numberOfDaysInactive: 0,
        },
        Novel: {
            numberOfDaysInactive: 0,
        },
        Webnovel: {
            numberOfDaysInactive: 0,
        },
        Anime: {
            numberOfDaysInactive: 0,
        },
        'TV-Series': {
            numberOfDaysInactive: 0,
        }
    },
    Hiatus: {
        Manga: {
            numberOfDaysInactive: 45, // 1 month as default progress + 2 weeks
        },
        Manhwa: {
            numberOfDaysInactive: 21, // 1 week as default progress + 2 weeks
        },
        Manhua: {
            numberOfDaysInactive: 21, // 1 week as default progress + 2 weeks
        },
        Novel: {
            numberOfDaysInactive: 548, // 1 year as default progress + half a year
        },
        Webnovel: {
            numberOfDaysInactive: 21, // 1 week as default progress + 2 weeks
        },
        Anime: {
            numberOfDaysInactive: 186, // 1 week as default progress with half a year as extra buffer
        },
        'TV-Series': {
            numberOfDaysInactive: 548, // 1 year as default progress + half a year
        }
    },
    Canceled: {
        Manga: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Manhwa: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Manhua: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Novel: {
            numberOfDaysInactive: 730, // set to 2 years
        },
        Webnovel: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Anime: {
            numberOfDaysInactive: 730, // set to 2 years
        },
        'TV-Series': {
            numberOfDaysInactive: 1500, // set to 4 years + extra buffer
        }
    }
}
// TODO: should be able to set status Score inside settings
export class NovelStatusCalculator {

    private readonly numberOfDaysInactive: number;

    constructor(HermidataUpdated: number, lastChecked: number,  RSSLatestItemPubDate?: Date) {
        // Hermidata.updated, and Hermidata.lastChecked, and Hermidata?.RSS.LatestItem.PubDate
        const updated = new Date(HermidataUpdated).getTime();
        const checked = new Date(lastChecked).getTime();
        const rss = new Date(RSSLatestItemPubDate || 0).getTime();
        
        // take only the latest one
        const lastDateUpdated = Math.max(updated, checked, rss);

        const today = new Date().getTime();

        // get the amount of days since last update
        this.numberOfDaysInactive = Math.floor((today - lastDateUpdated) / (1000 * 60 * 60 * 24));
    }
    


    public calculateStatus(currentStatus: AnyNovelStatus, novelType: AnyNovelType ): CalculateStatusReturnObject {

        const nextStatus = this.calculateNextStatus(currentStatus)

        // if the status or novel type is not found give return null
        if (!statusScore[currentStatus][novelType]) return { EnoughInfo: false, value: null };
        

            if (this.numberOfDaysInactive >= statusScore[nextStatus][novelType].numberOfDaysInactive) return { 
                EnoughInfo: true, 
                value: {
                    Decision: 'Change',
                    Status: nextStatus, 
                    Reason: statusScore[nextStatus][novelType].reason ?? 'The novel has been inactive for ' + this.numberOfDaysInactive + ' days',
                    InactiveDays: this.numberOfDaysInactive,
                    Score: this.numberOfDaysInactive / statusScore[nextStatus][novelType].numberOfDaysInactive

                }
            };

            return { 
                EnoughInfo: true, 
                value: {
                    Decision: 'Keep',
                    Status: currentStatus, 
                    Reason: statusScore[currentStatus][novelType].reason ?? 'The novel has been inactive for ' + this.numberOfDaysInactive + ' days well below the next  threshold',
                    InactiveDays: this.numberOfDaysInactive,
                    Score: this.numberOfDaysInactive / statusScore[nextStatus][novelType].numberOfDaysInactive
                } 
            };
    }
    private calculateNextStatus(currentStatus: Exclude<AnyNovelStatus, 'Completed'>): AnyNovelStatus {

        switch (currentStatus) {
            case 'Ongoing':
                return 'Hiatus';
            case 'Hiatus':
                return 'Canceled';
            case 'Canceled':
                return 'Canceled';
        }
        return 'Ongoing';
    }

}