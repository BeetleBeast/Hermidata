export type RegexConfig = {
    chapterRemoveRegexV3: RegExp,
    chapterRemoveRegexV2: RegExp,
    chapterRegex: RegExp,
    readRegex: RegExp,
    junkRegex: RegExp,
    siteNameRegex: RegExp,
    flexibleSiteNameRegex: RegExp,
    cleanTitleKeyword: RegExp
}

export type TrimmedTitle = {
    title: string,
    note: string
}