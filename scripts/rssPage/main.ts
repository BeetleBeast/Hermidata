import { RSSPageController } from "./controller";

document.addEventListener('DOMContentLoaded', () => {
    const rssPage = new RSSPageController()
    rssPage.init()
});