function getAuthToken(callback) {
  chrome.identity.getAuthToken({ interactive: true }, function (token) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    callback(token);
  });
}

function writeToSheet(token, dataArray) {
  const spreadsheetId = "YOUR_SPREADSHEET_ID";
  const range = "Sheet1!A1"; // Adjust as needed

  fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [dataArray]  // e.g., ["Novel Name", "URL", "Ch. 20", "Reading"]
    })
  })
  .then(res => res.json())
  .then(data => {
    console.log("Sheet updated:", data);
  })
  .catch(err => console.error("Error writing to sheet:", err));
}

// Example usage from popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SAVE_NOVEL") {
    getAuthToken((token) => {
      writeToSheet(token, msg.data);
    });
  }
});
