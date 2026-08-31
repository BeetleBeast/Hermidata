import { dbAccess } from "../shared/db/Storage";
import { Controller } from "./controller";

document.addEventListener('DOMContentLoaded', async () => {


    const getDb = new dbAccess();

    const settings = await getDb.getSettings();
    const allHermidata = await getDb.getAllHermidata();
    const rssPage = new Controller(allHermidata, settings);
    await rssPage.init()
});