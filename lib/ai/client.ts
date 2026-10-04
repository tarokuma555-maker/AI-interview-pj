import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** サーバー専用の Anthropic クライアント。APIキーは環境変数 ANTHROPIC_API_KEY から読む */
export function getAnthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY が設定されていません(APIを使わずに試す場合は AI_PROVIDER=mock)");
    }
    client = new Anthropic({ maxRetries: 2, timeout: 60_000 });
  }
  return client;
}
