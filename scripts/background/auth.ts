import { ext } from "../shared/BrowserCompat";

type BackgroundStorageItems = {
    googleAccessToken: string;
    googleTokenExpiry: number;
    userEmail?: string;
}



export function getToken(callback: Function) {
    ext.storage.local.get(["googleAccessToken", "googleTokenExpiry","userEmail"], (items: BackgroundStorageItems) => {
        const now = Date.now();

        if (items.googleAccessToken && items.googleTokenExpiry > now) {
            // Token is still valid
            return callback(items.googleAccessToken);
        }
        const clientId = '10068474315-qegara9du372dg55gv3tur6keuegke4n.apps.googleusercontent.com';
        const redirectUri = ext.identity.getRedirectURL();
        const scope = 'https://www.googleapis.com/auth/spreadsheets';
        const loginHintParam = items.userEmail ? `&login_hint=${encodeURIComponent(items.userEmail)}` : "";
        const authUrl =
            `https://accounts.google.com/o/oauth2/auth` +
            `?client_id=${clientId}` +
            `&response_type=token` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${encodeURIComponent(scope)}` + 
            loginHintParam;

        ext.identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            (redirectUrl) => {
            if (ext.runtime.lastError || !redirectUrl) {
                console.error('Auth failed:', ext.runtime.lastError?.message || 'No redirect URL returned');
                return;
            }

            // Parse the access token from the URL and save it in local storage
            const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
            const token = params.get("access_token");
            if (!token) {
                console.error("Access token not found in redirect URL");
                return;
            }
            const expires_inString = params.get("expires_in");
            if (!expires_inString) {
                console.error("Expires in not found in redirect URL");
                return;
            }
            const expiresIn = Number.parseInt(expires_inString, 10) * 1000; // ms
            const expiry = Date.now() + expiresIn;

            if (!token) {
                console.error("Access token not found in redirect URL");
                return;
            }

            // Extract the email if possible via API or save if known
            const updatedStorage: BackgroundStorageItems = {
                googleAccessToken: token,
                googleTokenExpiry: expiry
            };

            if (items.userEmail) {
                updatedStorage.userEmail = items.userEmail;
            }

            ext.storage.local.set(updatedStorage, () => {
                callback(token);
            });
        });
    });
}