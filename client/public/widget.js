/* Nova Support Agent embed helper. Add this script to any of the four products. */
(function () {
  var script = document.currentScript;
  var config = (script && script.dataset) || {};
  var agentUrl = config.agentUrl || (script && new URL(script.src).origin) || window.location.origin;
  var systemId = config.systemId || "1";
  var systemName = config.systemName || "نظامك";
  var page = window.location.pathname;
  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "فتح المساعد الذكي");
  button.textContent = "✦";
  button.style.cssText = "position:fixed;bottom:24px;right:24px;width:52px;height:52px;border:0;border-radius:18px;background:#101b35;color:#9af0d3;font-size:25px;box-shadow:0 12px 30px rgba(16,27,53,.22);z-index:2147483646;cursor:pointer";
  var panel = document.createElement("iframe");
  panel.title = "Nova Support Agent";
  panel.src = agentUrl + "/embed?systemId=" + encodeURIComponent(systemId) + "&systemName=" + encodeURIComponent(systemName) + "&page=" + encodeURIComponent(page);
  panel.style.cssText = "display:none;position:fixed;bottom:88px;right:24px;width:min(420px,calc(100vw - 32px));height:min(680px,calc(100vh - 112px));border:0;border-radius:24px;box-shadow:0 24px 60px rgba(16,27,53,.24);z-index:2147483645;background:#f6f7fb";
  button.addEventListener("click", function () { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
  document.body.appendChild(panel);
  document.body.appendChild(button);
})();
