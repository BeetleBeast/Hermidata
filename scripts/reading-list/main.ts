import { dbAccess } from "../shared/db/Storage";
import { initTheme } from "../shared/utils/Theme";
import { ReadingListController } from "./controller";

void initTheme();

document.addEventListener('DOMContentLoaded', async () => {
    const controller = new ReadingListController(new dbAccess());
    await controller.init();
});
