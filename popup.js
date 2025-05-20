document.getElementById("save").addEventListener("click", () => {
  const title = document.getElementById("title").value;
  const url = document.getElementById("url").value;
  const progress = document.getElementById("progress").value;

  chrome.runtime.sendMessage({
    type: "SAVE_NOVEL",
    data: [title, url, progress, "Reading"]
  });
});
