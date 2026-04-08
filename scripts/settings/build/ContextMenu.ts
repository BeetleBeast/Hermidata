import { saveSettings } from "../../shared/db/Storage";
import { Build } from "../build";

export class ContextMenu extends Build {


    constructor() {
        super();
    }


    public async AllowContextMenu(e: Event) {
            const event = e.target as HTMLInputElement;
            const isChecked = event.checked;
            const updatedSettings = await this.ensureSettingsUpToDate();
            updatedSettings.AllowContextMenu = isChecked;

            saveSettings(updatedSettings);
        }

}