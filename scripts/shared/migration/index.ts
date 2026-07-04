import { migrateFromChromeStorage, migrateHermidataToLatest } from "../db/db";
import { getAllHermidata, getSettings, migrateSettings, resetSettings  } from "../db/Storage";
import { calculateNovelStatusForAll } from "../utils/NovelStatusCalculator";


/** Makes all migration steps */
export async function migrationSteps(): Promise<void> {

    const settings = await getSettings();

    // await resetSettings(); // dev-only
    await migrateSettings(settings);
    await migrateFromChromeStorage();
    await migrateHermidataToLatest();

    const onlyRSSStatusScore = settings.ExtensionBehaviour.AutoSetStatusScore.onlyRSS;
    const allowAllDateFields = settings.ExtensionBehaviour.AutoSetStatusScore.allowAllDateFields;

    if (onlyRSSStatusScore || allowAllDateFields) await calculateNovelStatusForAll();
}