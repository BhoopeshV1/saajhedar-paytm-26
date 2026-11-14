// One Claude client for the whole server, and a helper for jobs that want a
// structured answer rather than a conversation: reading a bill photo, writing
// reminders. The model answers by calling a single tool whose input is the result.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
export const EFFORT = (process.env.CLAUDE_EFFORT || "low") as "low" | "medium" | "high";
export const client = new Anthropic();
export const claudeReady = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export class LlmError extends Error {}

export async function structured<T>(opts: { system: string; content: Anthropic.Beta.BetaContentBlockParam[] | string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> }; maxTokens?: number }): Promise<T> {
  if (!claudeReady()) throw new LlmError("ANTHROPIC_API_KEY is not set, so this cannot run yet.");
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: opts.maxTokens ?? 4096,
    system: `${opts.system}\n\nAnswer only by calling the ${opts.tool.name} tool, exactly once.`,
    tools: [opts.tool as any],
    output_config: { effort: EFFORT },
    messages: [{ role: "user", content: opts.content as any }],
  } as any);
  if (res.stop_reason === "refusal") throw new LlmError("The model declined this request.");
  const call = res.content.find((b: any) => b.type === "tool_use") as any;
  if (!call) throw new LlmError("The model did not return a structured answer. Try again.");
  return call.input as T;
}
