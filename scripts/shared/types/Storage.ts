import type { Hermidata } from "../../popup/in/main";
import { ext } from "../BrowserCompat";

export async function getHermidataViaKey(key: string): Promise<Hermidata | null> {
    return new Promise((resolve: (value: Hermidata) => void, reject) => {
        ext.storage.sync.get([key], (result: { [s: string]: Hermidata; }) => {
            if (ext.runtime.lastError) return reject(new Error(`${ext.runtime.lastError}`));
            resolve(result?.[key]);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        console.log('Key',key,'\n');
        return null;
    })
}