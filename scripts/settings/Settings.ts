import { BuildController } from "./build";


document.addEventListener("DOMContentLoaded", async () => {

    const settings = new Settings();
    await settings.init();
});

class Settings {

    private readonly buildController: BuildController = new BuildController();

    public async init() {
        // Load & populate page inputs and tables
        await this.buildController.init();
    }

}