// A real phone call through Sarvam's voice agents (Instant Outbound API):
// POST /api/outbounds/v1/orgs/{org}/workspaces/{workspace}/outbounds with the
// agent to run, the number it calls from and the number to ring. The agent
// itself (its script, voice and what it may agree) is set up on Sarvam's side;
// this only starts the call and says where the report should be sent.
// Nothing here runs unless every setting below is present in .env.
import fs from "node:fs";
import path from "node:path";

const env = process.env;
const key = () => env.SARVAM_AGENT_KEY || env.SARVAM_API_KEY;
const NEED = ["SARVAM_ORG_ID", "SARVAM_WORKSPACE_ID", "SARVAM_AGENT_APP_ID", "SARVAM_CONNECTION_ID", "SARVAM_AGENT_NUMBER"] as const;
export const outboundMissing = () => [...(key() ? [] : ["SARVAM_AGENT_KEY"]), ...NEED.filter((k) => !env[k])];
export const outboundReady = () => outboundMissing().length === 0;

function hookUrl() {
  if (!env.PUBLIC_URL) return null;
  try { const k = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "..", ".site-auth.json"), "utf8")).hook_key; return k ? `${env.PUBLIC_URL.replace(/\/$/, "")}/api/calls/webhook?key=${k}` : null; } catch { return null; }
}

// Ten-digit Indian mobile numbers are sent as +91XXXXXXXXXX.
export const e164 = (n: string) => { const d = n.replace(/\D/g, ""); return d.length === 10 ? `+91${d}` : d.length === 12 && d.startsWith("91") ? `+${d}` : n.trim(); };

export async function placeCall(to: string, variables: Record<string, string | number>, language?: "English" | "Tamil" | "Hindi") {
  const missing = outboundMissing();
  if (missing.length) throw new Error(`Real calls are not set up. Missing in .env: ${missing.join(", ")}.`);
  const hook = hookUrl();
  const body = {
    app_config: {
      app_id: env.SARVAM_AGENT_APP_ID, app_version: Number(env.SARVAM_AGENT_VERSION || 1),
      connection_config: { connection_id: env.SARVAM_CONNECTION_ID, agent_phone_number: env.SARVAM_AGENT_NUMBER },
      agent_variables: variables,
      ...(language ? { app_overrides: { initial_language_name: language } } : {}),
    },
    user_config: { user_phone_number: e164(to) },
    ...(hook ? { webhook_config: { url: hook, metadata: { supplier: String(variables.supplier ?? "") } } } : {}),
  };
  const res = await fetch(`https://apps.sarvam.ai/api/outbounds/v1/orgs/${env.SARVAM_ORG_ID}/workspaces/${env.SARVAM_WORKSPACE_ID}/outbounds`,
    { method: "POST", headers: { "X-API-Key": key()!, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sarvam refused the call (${res.status}): ${text.slice(0, 300)}`);
  let out: any = {}; try { out = JSON.parse(text); } catch {}
  return { attempt_id: String(out.attempt_id ?? ""), to: e164(to), report_to_webhook: !!hook };
}
