import { BuildController } from "./controller";


document.addEventListener("DOMContentLoaded", async () => {

    const settings = new BuildController();
    // Load & populate page inputs and tables
    await settings.init();
});