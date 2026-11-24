import { getAllHermidata, getSettings, saveAllHermidata } from "../db/Storage";
import { resolveAutoSetStatusMode } from "./SettingsValues";
import type { AnyNovelStatus, AnyNovelType, AutoSetStatusMode, Hermidata, NovelType } from "../types";
import { logConsoleError } from "./ErrorMessage";

/*
Sets the novel status ( Ongoing → Hiatus → Canceled ) from how long a novel has been inactive.

- evaluateStatus is pure: it only decides, so it is easy to test and could power a preview
- applyNovelStatusUpdates reads the library, applies the decisions and saves the changed entries once
- a status is only ever moved forward on the ladder; Completed and custom statuses are left alone
*/

/** The statuses this calculator manages, in the order a novel goes through them */
export const STATUS_LADDER = ['Ongoing', 'Hiatus', 'Canceled'] as const;
type LadderStatus = typeof STATUS_LADDER[number];
type AutoStatus = Exclude<LadderStatus, 'Ongoing'>;

/** Days without activity before a status applies */
export type StatusThreshold = Record<AutoStatus, number>;

/**
 * Days without activity before a novel counts as on hiatus, and then as canceled.
 * Hiatus allows a few missed releases at the usual pace; Canceled allows for the long breaks that are normal for the type.
 */
export const DEFAULT_STATUS_THRESHOLDS: Record<NovelType, StatusThreshold> = {
    Manga:       { Hiatus: 60,  Canceled: 730  }, // monthly chapters; breaks of a year or more are common
    Manhwa:      { Hiatus: 30,  Canceled: 365  }, // weekly chapters, with season breaks
    Manhua:      { Hiatus: 30,  Canceled: 365  }, // weekly or faster
    Webnovel:    { Hiatus: 30,  Canceled: 365  }, // several chapters a week
    Novel:       { Hiatus: 548, Canceled: 1095 }, // about a volume a year
    Anime:       { Hiatus: 120, Canceled: 1095 }, // a season runs ~3 months; sequels often take 2+ years
    'TV-Series': { Hiatus: 548, Canceled: 1461 }, // about a season a year
};
/** For types the user added themselves */
export const FALLBACK_STATUS_THRESHOLD: StatusThreshold = { Hiatus: 90, Canceled: 730 };

const DAY_MS = 24 * 60 * 60 * 1000;

export type StatusDecision =
    | { kind: 'skip'; reason: string }
    | { kind: 'keep'; status: LadderStatus; inactiveDays: number; next: { status: AutoStatus; inDays: number } | null }
    | { kind: 'change'; from: LadderStatus; to: AutoStatus; inactiveDays: number; reason: string };

export interface StatusInput {
    status: AnyNovelStatus | undefined;
    novelType: AnyNovelType;
    /** Epoch ms of the newest activity, or null when there is none */
    lastActivity: number | null;
    now: number;
    thresholds?: Partial<Record<AnyNovelType, StatusThreshold>>;
    fallback?: StatusThreshold;
    /** Folder aliases ( type → name ); a type stored under its alias still finds its thresholds */
    typeAliases?: Record<string, string>;
    /** The statuses the user has; a status missing from this list is never set */
    availableStatuses?: readonly AnyNovelStatus[];
}

/** Decides the status for one novel. Pure: no storage, no clock, no settings. */
export function evaluateStatus(input: StatusInput): StatusDecision {
    const status = input.status || 'Ongoing';
    const index = (STATUS_LADDER as readonly string[]).indexOf(status);
    if (index === -1) return { kind: 'skip', reason: `status "${status}" is not set automatically` };
    if (input.lastActivity === null) return { kind: 'skip', reason: 'no activity date' };

    const threshold = thresholdFor(input.novelType, input.thresholds ?? DEFAULT_STATUS_THRESHOLDS, input.fallback ?? FALLBACK_STATUS_THRESHOLD, input.typeAliases);
    const inactiveDays = Math.max(0, Math.floor((input.now - input.lastActivity) / DAY_MS));
    const reachable = (STATUS_LADDER.slice(index + 1) as AutoStatus[])
        .filter(next => !input.availableStatuses || input.availableStatuses.includes(next));

    // the furthest status already due, so a long-inactive novel lands on it in one run
    const due = reachable.filter(next => inactiveDays >= threshold[next]).at(-1);
    if (due) return {
        kind: 'change',
        from: status as LadderStatus,
        to: due,
        inactiveDays,
        reason: `inactive for ${inactiveDays} days ( ${due} after ${threshold[due]} )`,
    };

    const next = reachable[0];
    return {
        kind: 'keep',
        status: status as LadderStatus,
        inactiveDays,
        next: next ? { status: next, inDays: threshold[next] - inactiveDays } : null,
    };
}

function thresholdFor(
    novelType: AnyNovelType,
    thresholds: Partial<Record<AnyNovelType, StatusThreshold>>,
    fallback: StatusThreshold,
    typeAliases: Record<string, string> = {},
): StatusThreshold {
    if (thresholds[novelType]) return thresholds[novelType];
    const aliasedType = Object.keys(typeAliases).find(type => typeAliases[type] === novelType);
    return (aliasedType && thresholds[aliasedType]) || fallback;
}

/**
 * The newest moment the novel showed activity, as epoch ms, or null when there is none.
 * - rss: the newest RSS item of any linked feed
 * - all: that, or the last time a chapter was checked
 * meta.updated is left out on purpose: every edit ( tags, notes, this calculator's own save ) bumps it.
 */
export function lastActivityAt(hermidata: Hermidata, mode: Exclude<AutoSetStatusMode, 'off'>): number | null {
    const dates = (hermidata.rss ?? []).map(feed => toTime(feed.latestItem?.pubDate)); // latestItem is absent on a fresh synced device
    if (mode === 'all') dates.push(toTime(hermidata.chapter?.lastChecked));

    const valid = dates.filter((time): time is number => time !== null);
    return valid.length ? Math.max(...valid) : null;
}

function toTime(value: Date | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time > 0 ? time : null;
}

export type StatusChange = { id: string; title: string; from: LadderStatus; to: AutoStatus; inactiveDays: number; reason: string };

/**
 * Moves every novel to the status its inactivity calls for, if the setting is on, and saves the changed ones together.
 * Never throws: a broken entry is logged and skipped, so it cannot stop the rest of the library ( or startup ).
 */
export async function applyNovelStatusUpdates(now: number = Date.now()): Promise<StatusChange[]> {
    try {
        const settings = await getSettings();
        const mode = resolveAutoSetStatusMode(settings.ExtensionBehaviour?.AutoSetStatusScore);
        if (mode === 'off') return [];

        const typeAliases = settings.FolderMapping?.typeAliases;
        const availableStatuses = settings.ContentTypesAndStatuses?.NOVEL_STATUS_OPTIONS;

        const changes: StatusChange[] = [];
        const changed: Hermidata[] = [];

        for (const hermidata of Object.values(await getAllHermidata())) {
            try {
                const decision = evaluateStatus({
                    status: hermidata.meta?.novelStatus,
                    novelType: hermidata.novelType,
                    lastActivity: lastActivityAt(hermidata, mode),
                    now,
                    typeAliases,
                    availableStatuses,
                });
                if (decision.kind !== 'change') continue;

                hermidata.meta.novelStatus = decision.to;
                changed.push(hermidata);
                changes.push({ id: hermidata.id, title: hermidata.title, from: decision.from, to: decision.to, inactiveDays: decision.inactiveDays, reason: decision.reason });
            } catch (err) {
                logConsoleError(`[Novel Status Calculator] skipped ${hermidata?.id}:`, err);
            }
        }

        if (changed.length) {
            await saveAllHermidata(changed);
            console.groupCollapsed(`[Novel Status Calculator] changed ${changes.length} statuses`);
            console.table(changes);
            console.groupEnd();
        }
        return changes;
    } catch (err) {
        logConsoleError('[Novel Status Calculator] applyNovelStatusUpdates:', err);
        return [];
    }
}
