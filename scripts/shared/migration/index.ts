import { getDb, migrateFromChromeStorage, migrateHermidataToLatest } from "../db/db";
import { getAllHermidata, getAllRawFeeds, getSettings, migrateSettings, resetSettings, setAllHermidata  } from "../db/Storage";
import { runFeedsSeenMigration } from "./Feeds";
import { calculateNovelStatusForAll } from "../utils/NovelStatusCalculator";
import { HermidataMigration } from "./Hermidata";


/** Makes all migration steps */
export async function migrationSteps(): Promise<void> {

    const settings = await getSettings();

    // await resetSettings(); // dev-only
    await migrateSettings(settings);
    await migrateFromChromeStorage();
    await migrateHermidataToLatest();

    await HermidataMigration.migrateFeedsToLatest();
    await runFeedsSeenMigration(await getDb(), getAllHermidata, getAllRawFeeds, setAllHermidata);

    const onlyRSSStatusScore = settings.ExtensionBehaviour.AutoSetStatusScore.onlyRSS;
    const allowAllDateFields = settings.ExtensionBehaviour.AutoSetStatusScore.allowAllDateFields;

    if (onlyRSSStatusScore || allowAllDateFields) await calculateNovelStatusForAll();
}