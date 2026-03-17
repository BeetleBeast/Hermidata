/**
 * Entry to auto merge duplicates
 * @param {number} threshold - decimal number dictating the threshold of similarity to merge found entries
 * @returns - merged Keys, titles, sources and levenstein score
 */
export async function migrateAndAutoMergeDuplicates(threshold = 0.9) {
    // Step 1: migrate all old hashes first
    await migrateOldHashes();

    // Step 2: scan for duplicates
    console.log("Scanning for duplicates after migration...");
    const dups = await findPotentialDuplicates(threshold);

    if (!dups.length) {
        console.log("No duplicates found after migration.");
        return [];
    }

    console.warn(`Found ${dups.length} potential duplicates.`);
    console.table(
        dups.map(d => ({
            TitleA: d.titleA,
            TitleB: d.titleB,
            Score: d.score.toFixed(2),
        }))
    );

    // Step 3: automatically merge them
    for (const dup of dups) {
        await autoMergeDuplicate(dup.keyA, dup.keyB);
    }

    console.log("All possible duplicates processed.");
    return dups;
}

/**
 * Automatically merges two entries by picking the one
 * with the highest chapter.latest (or the newest update).
 */
export async function autoMergeDuplicate(idA, idB) {
    const data = AllHermidata || await getAllHermidata();
    const objA = data[idA];
    const objB = data[idB];

    if (!objA || !objB) {
        console.warn(`Skipping missing objects:`, idA, idB);
        return;
    }

    // Compare chapter.latest as "progress"
    const latestA = objA.chapter?.latest ?? 0;
    const latestB = objB.chapter?.latest ?? 0;

    // Pick which one is "newer"
    let newer = objA;
    let older = objB;
    if (latestB > latestA) [newer, older] = [objB, objA];

    const newerHashType = detectHashType(newer);
    const olderHashType = detectHashType(older);
    console.log(`Auto-merging "${older.title}" → "${newer.title}"`,
        `\n newer hash: ${newerHashType}`,
        `\n older hash: ${olderHashType}`
    );
    // check if Hash is the old way
    // Use your existing migrateHermidataV5 logic
    const merged = await migrateHermidataV5(newer, older,
        olderHashType === 'old' ? 'OLD' : 'DEFAULT',
        newerHashType === 'old' ? 'OLD' : 'DEFAULT'
    );

    // Save and remove the old entry key
    if (merged) {
        await browserAPI.storage.sync.set({ [merged.id]: merged });
        await browserAPI.storage.sync.remove(older.id);
        console.log(`Merged "${older.title}" into "${newer.title}"`);
    } else {
        console.error(`Merge failed for:`, older.title, newer.title);
    }
}


/**
 * Select 2 ID's wich the user wants to merge
 * @param {String} id1 
 * @param {String} id2 
 */
export async function SelectDuplicates(id1, id2) {
    const data = AllHermidata || await getAllHermidata();
    const obj1 = data[id1];
    const obj2 = data[id2];
    const finalObj = await migrationSteps(obj1, obj2);
    console.log('finalObj is: ',finalObj)
}
/**
 * compare the similarity between both inputs
 * @param {String} id1 
 * @param {String} id2 
 * @returns {Premise<{
 * keyA: String
 * keyB: String
 * titleA: String
 * titleB: String
 * sourceA: String
 * sourceB: String
 * RSSA: object|null
 * RSSB: object|null
 * score: number
 * }>}
 */
export async function findDuplicatescore(id1, id2) {
    const data = AllHermidata || await getAllHermidata();
    const score = CalcDiff(data[id1].title, data[id2].title);
    let output = []
    output.push({
        keyA: id1,
        keyB: id2,
        titleA: data[id1].title,
        titleB: data[id2].title,
        sourceA: data[id1].source,
        sourceB: data[id2].source,
        RSSA: data[id1]?.rss || null,
        RSSB: data[id2]?.rss || null,
        score: score
    })
    return output;
}


export async function findPotentialDuplicates(threshold = 0.9) {
    const data = AllHermidata || await getAllHermidata();
    const entries = Object.entries(data);
    const duplicates = [];

    console.group("Duplicate Title Scan");

    for (let i = 0; i < entries.length; i++) {
        const [keyA, valA] = entries[i];
        for (let j = i + 1; j < entries.length; j++) {
            const [keyB, valB] = entries[j];

            // Skip if same source and title already identical
            if (valA.source === valB.source && valA.title === valB.title && valA.id === valB.id ) continue;

            const score = CalcDiff(valA.title, valB.title);
            if (score >= threshold) {
                duplicates.push({
                    keyA,
                    keyB,
                    titleA: valA.title,
                    titleB: valB.title,
                    sourceA: valA.source,
                    sourceB: valB.source,
                    score
                });

                console.warn(
                    `[DUPLICATE ${score.toFixed(2)}]`,
                    `(${valA.source}) "${valA.title}" ↔ (${valB.source}) "${valB.title}"`
                );
            }
        }
    }

    console.groupEnd();

    console.info(`Scan complete: found ${duplicates.length} potential duplicates.`);
    return duplicates;
}