/**
 * Title
 * Type
 * needs both 
 * @returns the hermidata json object
 */
async function getHermidata() {
try {
    // get all Hermidata
    const allHermidata = AllHermidata || await getAllHermidata();

    let absoluteObj = {}

    // find title from alt
    const posibleTitleV2 = HermidataV3.meta.notes.replace('Chapter Title: ', '');
    let TrueTitle;
    if  (findByTitleOrAltV2(HermidataV3.title, allHermidata)?.title) {
        TrueTitle = findByTitleOrAltV2(HermidataV3.title, allHermidata)?.title;
    } else if (findByTitleOrAltV2(posibleTitleV2, allHermidata)?.title) {
        TrueTitle = findByTitleOrAltV2(posibleTitleV2, allHermidata)?.title;
        HermidataV3.meta.notes = '';
    }
    // find title from fuzzy seach
    const AltKeyNeeded = await detectAltTitleNeeded(HermidataV3.title, HermidataV3.type);
    const fuzzyKey = AltKeyNeeded?.relatedKey;
    // Generate all possible keys
    const possibleKeys = novelType.map(type => returnHashedTitle(TrueTitle, type));
    // add fuzzy key if not inside possible keys
    if (fuzzyKey && !possibleKeys.includes(fuzzyKey)) possibleKeys.push(fuzzyKey);
    // get all posible hermidata Obj
    const possibleObj = {}
    for (const key of possibleKeys) {
        const obj = await getHermidataViaKey(key);
        if ( obj && Object.keys(obj).length) possibleObj[key] = obj;
    }
    console.log('posible Objects', possibleObj)

    // add alt title to Object
    if (AltKeyNeeded?.needAltTitle && fuzzyKey && possibleObj[fuzzyKey]) {
        const confirmation = await customConfirm(`${AltKeyNeeded.reason}\nAdd "${HermidataV3.title}" as an alt title for "${possibleObj[fuzzyKey].title}"?`);
        if (confirmation) await appendAltTitle(HermidataV3.title, possibleObj[fuzzyKey]);
    }

    if ( Object.keys(possibleObj).length == 1 ) {
        absoluteObj = Object.values(possibleObj)[0]
        return absoluteObj
    }
    // more then 1 result -> filter it
    if ( Object.keys(possibleObj).length > 1 ) {
        absoluteObj = await tryToFindByOtherMeans(possibleObj)

        const objs = Object.values(possibleObj);
        // Check for possible same-series different-type pairs
        return await migrateCopy(objs)
    }
    if ( Object.entries(absoluteObj).length > 0) return absoluteObj

    const key = makeHermidataKey();
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.get([key], (result) => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
            resolve(result?.[key] || {});
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        console.log('Key',key,'\n', '\n','HermidataV3', HermidataV3);
        return {};
    })
} catch (err) {
    console.error("Fatal error in getHermidata:", err);
    return {};
}
}