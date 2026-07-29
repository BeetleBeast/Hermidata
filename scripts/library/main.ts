import { getAllHermidata, getSettings } from "../shared/db/Storage";
import { Controller } from "./controller";

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await getSettings();
    const allHermidata = await getAllHermidata();
    const rssPage = new Controller(allHermidata, settings);
    await rssPage.init()
});