export type { 
    RegexConfig,
    TrimmedTitle,

    NovelType,
    NovelStatus,
    ReadStatus,

    ContentRating,
    ContentWarning,

    migrationReturn,
    
    Hermidata,
    Bookmark,

    HermidataDateType,
    HermidataSortType,
    AllHermidata,

    AltCheck,

    InputArrayType,
    InputArraySheetType,

    AllFeeds,

    Feed,
    RawFeed,
    FeedItem,

    AnyNovelType,
    AnyNovelStatus,
    AnyReadStatus,

    LatestValue,
    CurrentTab,

    ShouldReplaceOrBlockReturn,
    ShouldBlockReturn,
    ShouldReplaceReturn,

    PotentialSameHermidata,

    StringListFieldPath,
    ValueAtPath,

    RawScrapedItem,
    RawScrappedFeed,
    
    Migration,

    ReleaseSchedule,

} from "./popup";

export type {

    FeedV1,
    RawFeedV1,
    FeedItemV1,

    BookmarkV1,
    BookmarkV2,
    BookmarkV3,

    HermidataV1,
    HermidataV2,
    HermidataV3,
    HermidataV4,
    HermidataV5,
    HermidataV6,
    HermidataV7,
    HermidataV8,
    HermidataV9,
    HermidataV10,

    AnyHermidataVersion,
    allOlderHermidata,

} from "./oldVersions";

export type {
    NormalSortsType,
    ExeptionSortsType,
    ReverseAllsortsType,

    AllsortsType,
    
    MenuOptions,
    MenuOption,
    separator,
    subMenu,

    Filters,

    FilterName,
    FilterClassName,
    

    RSSDOM,
    RSSData,

    TagMap,
    SwitchConfig,

    FuzzyHermidataMatches,
    FuzzyBookmarkMatches,
    FuzzyMatchResult,

    HermidataMigrationConfiguration,
    ScalarConflict

} from "./rss";

export type {

    DefaultChoice,
    Settings,

    elementInput,
    elementMenu,

    quickBackup,

    elementsInputAndMenu,
    ElmentsWithInputAndMenu,

    FolderMapping,
    FolderRule,

    NotificationTypes,
    SaveTargets

} from "./settings";