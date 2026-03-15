chrome.runtime.onMessage.addListener((
  message: { action: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  if (message.action === "fetchNoncompliant") {
    fetch(
      "https://api.nasdaq.com/api/quote/list-type-extended/listing?queryString=deficient"
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});
