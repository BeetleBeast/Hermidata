export { 
    type RegexConfig,
    type TrimmedTitle,

    type NovelType,
    type NovelStatus,
    type ReadStatus,

    DEFAULT_NOVEL_TYPES,
    DEFAULT_NOVEL_STATUSES,
    DEFAULT_READ_STATUSES,
    DEFAULT_TAGS,
    DEFAULT_TAG_COLOURS,

    type Hermidata,
    type HermidataV5,
    type Bookmark,

    type HermidataDateType,
    type HermidataSortType,
    type AllHermidata,

    type AltCheck,

    type InputArrayType,
    type InputArraySheetType,

    type AllFeeds,

    type Feed,
    type RawFeed,
    type FeedItem,

} from "./popup";

export type { AnyNovelType, AnyNovelStatus, AnyReadStatus } from "./popup";

export {
    type NormalSortsType,
    type ExeptionSortsType,
    type ReverseAllsortsType,

    type AllsortsType,
    AllSorts,

    type MenuOption,
    type separator,

    type Filters,

    type FilterName,
    type FilterClassName,
    filterClassName,
    filterName,

    type RSSDOM,
    type RSSData,
} from "./rss";
export {

    type DefaultChoice,
    type Settings,

    type NotificationTypes,

    type elementInput,
    type elementMenu,

    type quickBackup,

    type elementsInputAndMenu,
    type ElmentsWithInputAndMenu,

    type FolderMapping,
    type FolderRule,

    defaultSettings,

} from "./settings";