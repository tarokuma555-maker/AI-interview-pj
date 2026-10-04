import { z } from "zod";
import { ClaudeInterviewer } from "@/lib/ai/interviewer";
import { MockInterviewer } from "@/lib/ai/mock";
import { isMockAi } from "@/lib/ai/models";
import { questionPlanSchema } from "@/lib/ai/schemas/plan";
import { renderSessionContext } from "@/lib/ai/session-context";
import { runTurn } from "@/lib/interview/turn-engine";
import {
  candidateContextSchema,
  sessionSettingsSchema,
  sessionStateSchema,
  turnRecordSchema,
} from "@/lib/interview/types";
import { checkPocAccess, jsonError, readJson } from "@/lib/poc/access";
import { getTtsClient } from "@/lib/speech/tts";
import { TTS_PROVIDERS } from "@/lib/speech/voices";

export const maxDuration = 60;

/**
 * 回答を受け取り、面接官の発言と音声を NDJSON で返す(設計書 5.5)。
 * 試作版はデータベースを使わないため、会話履歴と状態はブラウザが保持して毎回送る。
 */
const bodySchema = z.object({
  kind: z.enum(["start", "answer", "continue"]),
  settings: sessionSettingsSchema,
  context: candidateContextSchema,
  plan: questionPlanSchema,
  history: z.array(turnRecordSchema).max(200),
  state: sessionStateSchema,
  answer: z
    .object({
      text: z.string().max(2000),
      inputMode: z.enum(["voice", "text"]),
      speechMs: z.number().int().nonnegative().max(600_000).optional(),
      responseDelayMs: z.number().int().nonnegative().max(600_000).optional(),
    })
    .optional(),
  previous: z.object({ playedSentences: z.number().int().nonnegative().max(100), interrupted: z.boolean() }).optional(),
  reply: z.boolean().default(true),
  ttsProvider: z.enum(TTS_PROVIDERS),
});

export async function POST(request: Request) {
  const denied = checkPocAccess(request);
  if (denied) return denied;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 1_000_000));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "入力内容が正しくありません");
  }

  let tts;
  try {
    tts = getTtsClient(body.ttsProvider);
  } catch (error) {
    return jsonError(400, "TTS_UNAVAILABLE", error instanceof Error ? error.message : "音声合成を使えません");
  }

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const events = runTurn(
    {
      kind: body.kind,
      settings: body.settings,
      sessionContext: renderSessionContext(body.settings, body.context, body.plan),
      history: body.history,
      state: body.state,
      answer: body.answer,
      previous: body.previous,
      reply: body.reply,
    },
    { interviewer: isMockAi() ? new MockInterviewer() : new ClaudeInterviewer(), tts, signal: abort.signal },
  );

  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    cancel() {
      // ブラウザが割り込みでリクエストを中断した
      abort.abort();
      void iterator.return?.();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
