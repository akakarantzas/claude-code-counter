const HOST_NAME = "com.claudecounter.host";
let port = null;
let pendingCallbacks = [];
let connected = false;

function connect() {
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
    connected = true;

    port.onMessage.addListener((msg) => {
      // Resolve all waiting callbacks with this message
      const cbs = pendingCallbacks.splice(0);
      for (const cb of cbs) cb(null, msg);
    });

    port.onDisconnect.addListener(() => {
      connected = false;
      port = null;
      const err = chrome.runtime.lastError?.message || "disconnected";
      const cbs = pendingCallbacks.splice(0);
      for (const cb of cbs) cb(err, null);
    });
  } catch (e) {
    connected = false;
    port = null;
    const cbs = pendingCallbacks.splice(0);
    for (const cb of cbs) cb(e.message, null);
  }
}

function sendToHost(message, callback) {
  if (!connected || !port) {
    connect();
  }
  // If still not connected after trying, error out
  if (!port) {
    callback("disconnected", null);
    return;
  }
  pendingCallbacks.push(callback);
  try {
    port.postMessage(message);
  } catch (e) {
    pendingCallbacks.pop();
    connected = false;
    port = null;
    callback(e.message, null);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "GET_STATS") return false;

  sendToHost({ action: "get_stats" }, (err, response) => {
    if (err) {
      sendResponse({ error: "disconnected" });
      return;
    }
    if (!response || !response.data) {
      if (response?.error === "no_session") {
        sendResponse({ error: "no_session" });
      } else {
        sendResponse({ error: "disconnected" });
      }
      return;
    }
    sendResponse({ data: response.data });
  });

  return true; // keep message channel open for async response
});
