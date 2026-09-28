import { buildApp } from "../dist-server/app.mjs";

const app = buildApp();

export const config = {
  // agent runs stream LLM responses; leave headroom above the runtime deadline
  maxDuration: 60,
};

export default app;
