import { getDb, migrateFromChromeStorage, migrateHermidataToLatest } from "../db/db";
import { getAllHermidata, getAllRawFeeds, getSettings, migrateSettings, resetSettings, setAllHermidata  } from "../db/Storage";
import { runFeedsSeenMigration } from "./Feeds";
import { applyNovelStatusUpdates } from "../utils/NovelStatusCalculator";
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

    // reads the migrated settings itself, does nothing when turned off, and never throws
    await applyNovelStatusUpdates();
}