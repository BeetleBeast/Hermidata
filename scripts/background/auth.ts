import { ext } from "../shared/utils/BrowserCompat";

type BackgroundStorageItems = {
    googleAccessToken: string;
    googleTokenExpiry: number;
    userEmail?: string;
}



export async function getToken(): Promise<string> {
    const items: BackgroundStorageItems = await ext.storage.local.get(["googleAccessToken", "googleTokenExpiry", "userEmail"]);
    const now = Date.now();

    // Token is still valid
    if (items.googleAccessToken && items.googleTokenExpiry > now) return items.googleAccessToken;


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

    return new Promise((resolve, reject) => {
        ext.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectUrl) => {
            if (ext.runtime.lastError || !redirectUrl) return reject(new Error(ext.runtime.lastError?.message || 'No redirect URL returned'));
    
            // Parse the access token from the URL and save it in local storage
            const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
            const token = params.get("access_token");
            const expires_inString = params.get("expires_in");
            
            if (!token) return reject(new Error("Access token not found in redirect URL"));
            if (!expires_inString) return reject(new Error("Expires in not found in redirect URL"));
            
            const expiry = Date.now() + Number.parseInt(expires_inString, 10) * 1000; // ms
    
            // Extract the email if possible via API or save if known
            const updatedStorage: BackgroundStorageItems = {
                googleAccessToken: token,
                googleTokenExpiry: expiry,
                userEmail: items.userEmail
            };
    
            await ext.storage.local.set(updatedStorage);
            resolve(token);
        });
        
    })
}