/**
 * @fileoverview Types
 * - RegexConfig is a oject definition for regex patterns used in the TrimTitle class
 */
export type RegexConfig = {
    chapterRemoveRegexV3: RegExp,
    chapterRegex: RegExp,
    readRegex: RegExp,
    junkRegex: RegExp,
    siteNameRegex: RegExp,
    flexibleSiteNameRegex: RegExp,
    cleanTitleKeywordEnd: RegExp,
    cleanTitleKeywordStart: RegExp
}
/**
 * @fileoverview Types
 * - TrimmedTitle is a oject definition for trimmed title
 */
export type TrimmedTitle = {
    title: string,
    note: string
}