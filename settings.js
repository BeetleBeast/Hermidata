document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("spreadsheetUrl");
    const status = document.getElementById("status");

    // Load saved value
    chrome.storage.sync.get(["spreadsheetUrl"], (result) => {
        if (result.spreadsheetUrl) {
        input.value = result.spreadsheetUrl;
        }
    });

    // Save new value
    document.getElementById("save").addEventListener("click", () => {
        const url = input.value.trim();
        chrome.storage.sync.set({ spreadsheetUrl: url }, () => {
        status.textContent = "Saved!";
        setTimeout(() => status.textContent = "", 2000);
        });
    });
});
