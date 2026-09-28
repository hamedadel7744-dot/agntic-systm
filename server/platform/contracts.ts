export type PlatformPrincipal = {
  tenantId: string;
  subjectId?: string;
  source: "api_key" | "dashboard" | "internal";
};

export type RunRequest = {
  tenantId: string;
  agentId: string;
  input: string;
  conversationId?: string;
  externalSessionId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  requiresApproval: boolean;
  risk: "read" | "safe_action" | "sensitive";
};

export type ToolProposal = {
  name: string;
  input: Record<string, unknown>;
  reason?: string;
};

export type ToolExecutionContext = PlatformPrincipal & {
  runId: string;
  traceId: string;
  deadline: number;
};

export type ToolResult = {
  status: "success" | "failed" | "denied";
  output?: Record<string, unknown>;
  error?: string;
  verified?: boolean;
};

export interface PlatformTool {
  describe(): ToolDefinition;
  validate(input: Record<string, unknown>): void;
  authorize(ctx: ToolExecutionContext): Promise<"allow" | "deny" | "approval_required">;
  execute(ctx: ToolExecutionContext, input: Record<string, unknown>): Promise<ToolResult>;
  verify?(ctx: ToolExecutionContext, input: Record<string, unknown>, result: ToolResult): Promise<boolean>;
  health?(): Promise<boolean>;
}

export type RuntimeOutcome = {
  runId: string;
  traceId: string;
  status: "succeeded" | "waiting_approval" | "failed";
  answer: string;
  tokensUsed: number;
  toolCalls: number;
};
