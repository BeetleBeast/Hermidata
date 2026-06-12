import { getAllHermidata, getSettings } from "../shared/db/Storage";
import { RSSPageController } from "./controller";

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await getSettings();
    const allHermidata = await getAllHermidata();
    const rssPage = new RSSPageController(allHermidata, settings);
    await rssPage.init()
});