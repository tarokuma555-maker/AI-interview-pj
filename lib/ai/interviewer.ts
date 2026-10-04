import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getAnthropic } from "@/lib/ai/client";
import { FALLBACK_BETA, INTERVIEWER_MODELS, type InterviewerModelConfig } from "@/lib/ai/models";
import { buildInterviewerSystemPrompt } from "@/lib/ai/prompts/interviewer";
import type { InterviewerModelKey, UsageSummary } from "@/lib/interview/types";

export type InterviewerRequest = {
  modelKey: InterviewerModelKey;
  sessionContext: string;
  messages: BetaMessageParam[];
};

export type InterviewerResult = {
  /** 履歴として再送する content ブロック(受け取ったまま) */
  content: BetaContentBlockParam[];
  stopReason: string | null;
  usage: UsageSummary | null;
};

export interface InterviewerModel {
  stream(request: InterviewerRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<InterviewerResult>;
  /** 1問目の応答を速くするため、プロンプトキャッシュを事前に作成する(設計書 4.2) */
  prewarm(request: InterviewerRequest): Promise<void>;
}

/** system を「共通プロンプト」「セッション固有の情報(キャッシュの区切り)」の2ブロックで組み立てる */
export function buildSystemBlocks(config: InterviewerModelConfig, sessionContext: string): BetaTextBlockParam[] {
  return [
    { type: "text", text: buildInterviewerSystemPrompt({ directAnswerHint: config.directAnswerHint }) },
    { type: "text", text: sessionContext, cache_control: { type: "ephemeral" } },
  ];
}

function baseParams(request: InterviewerRequest) {
  const config = INTERVIEWER_MODELS[request.modelKey];
  return {
    model: config.id,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    // 会話履歴の末尾を自動でキャッシュする
    cache_control: { type: "ephemeral" as const },
    output_config: { effort: config.effort },
    ...(config.thinking ? { thinking: config.thinking } : {}),
    system: buildSystemBlocks(config, request.sessionContext),
    messages: request.messages,
  };
}

export class ClaudeInterviewer implements InterviewerModel {
  async stream(request: InterviewerRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<InterviewerResult> {
    const stream = getAnthropic().beta.messages.stream({ ...baseParams(request), max_tokens: 1024 }, { signal });
    stream.on("text", (delta) => onText(delta));
    const message = await stream.finalMessage();
    return {
      content: message.content as unknown as BetaContentBlockParam[],
      stopReason: message.stop_reason,
      usage: {
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }

  async prewarm(request: InterviewerRequest): Promise<void> {
    // max_tokens: 0 はキャッシュの書き込みだけを行う。ストリーミングとは併用できない
    await getAnthropic().beta.messages.create({ ...baseParams(request), max_tokens: 0 });
  }
}
