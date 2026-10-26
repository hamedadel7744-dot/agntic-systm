/* Nova Agent SDK v1: same contract used by Web, Mobile, and Backend integrations.
 * Key-only mode: apiKey alone runs the tenant's default agent; pass agentId to target a specific one. */
(function (global) {
  function createClient(options) {
    if (!options || !options.baseUrl || !options.apiKey) throw new Error("baseUrl and apiKey are required (agentId is optional — defaults to the tenant's first agent)");
    async function run(input, extra) {
      var response = await fetch(options.baseUrl.replace(/\/$/, "") + "/v1/runs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": options.apiKey, ...(extra && extra.headers ? extra.headers : {}) },
        body: JSON.stringify({ agentId: options.agentId, input: input, conversationId: extra && extra.conversationId, metadata: extra && extra.metadata })
      });
      var payload = await response.json();
      if (!response.ok) {
        // Unified failure contract: {error:{code,message,runId}} — with a fallback
        // to the run outcome for older responses, so the real failure reason and
        // its stable code are never lost behind a generic message.
        var err = payload.error || {};
        var data = payload.data || {};
        throw Object.assign(new Error(err.message || data.answer || "Agent request failed"), { code: err.code || data.errorCode, status: response.status, runId: err.runId || data.runId });
      }
      return payload.data;
    }
    return { run: run };
  }
  global.NovaAgent = { createClient: createClient, version: "1.1.0" };
})(window);
