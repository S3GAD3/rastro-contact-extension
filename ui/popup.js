let activeTab = null;
const target = document.getElementById("target");
const send = msg => chrome.runtime.sendMessage(msg);

(async () => {
  const res = await send({type: "GET_ACTIVE_TAB"});
  activeTab = res.tab;
  target.textContent = activeTab?.url || "No hay una pestaña compatible";
})();

document.getElementById("open").addEventListener("click", () => chrome.tabs.create({url: chrome.runtime.getURL("ui/investigation.html")}));
document.getElementById("analyze").addEventListener("click", async () => {
  if (!activeTab?.id || !/^https?:/i.test(activeTab.url || "")) return;
  const scan = await send({type: "SCAN_TAB", tabId: activeTab.id});
  if (!scan.ok) { target.textContent = `Error: ${scan.error}`; return; }
  const caseId = `case-${Date.now()}`;
  await chrome.storage.session.set({pendingCase: {id: caseId, current: scan.data, createdAt: new Date().toISOString()}});
  chrome.tabs.create({url: chrome.runtime.getURL(`ui/investigation.html?case=${encodeURIComponent(caseId)}`)});
  window.close();
});
