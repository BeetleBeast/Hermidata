import { BuildController } from "./controller";



document.addEventListener("DOMContentLoaded", async () => {

    const devMode = false; // set to true to show dev-only features in Imports and Exports section

    const settings = new BuildController(devMode);
    // Load & populate page inputs and tables
    await settings.init();
});