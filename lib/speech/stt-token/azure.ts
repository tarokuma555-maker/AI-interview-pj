/**
 * Azure AI Speech の一時トークンを発行する(設計書 5.4)。
 * トークンの有効期間は10分。ブラウザは期限前に再発行する。
 */
export const AZURE_TOKEN_TTL_MS = 10 * 60_000;

export async function issueAzureSpeechToken(): Promise<{ token: string; region: string; expiresAt: number }> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Azure AI Speech が設定されていません");

  const response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" },
  });
  if (!response.ok) throw new Error(`一時トークンの発行に失敗しました(Azure ${response.status})`);
  return { token: await response.text(), region, expiresAt: Date.now() + AZURE_TOKEN_TTL_MS };
}
