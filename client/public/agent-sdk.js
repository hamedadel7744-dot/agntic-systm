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
      if (!response.ok) throw Object.assign(new Error(payload.error && payload.error.message || "Agent request failed"), { code: payload.error && payload.error.code, status: response.status });
      return payload.data;
    }
    return { run: run };
  }
  global.NovaAgent = { createClient: createClient, version: "1.1.0" };
})(window);
