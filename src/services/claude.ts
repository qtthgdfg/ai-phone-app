// src/services/claude.ts
// Full Claude API integration: chat, vision, tools, streaming, extended thinking

import { Message, Attachment, ClaudeModel, MemoryEntry, UserStyle, ToolCall } from "../types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL: ClaudeModel = "claude-sonnet-4-20250514";

// ── Tool definitions sent to Claude ──────────────────────────────────────────

export const CLAUDE_TOOLS = [
  {
    name: "web_search",
    description: "Search the web for current information, news, facts, prices, weather, etc.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        num_results: { type: "number", description: "Number of results (default 5)", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "analyze_image",
    description: "Analyze and describe an image in detail.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What to analyze: describe | ocr | objects | faces | code | chart | translate",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "remember",
    description: "Save important facts about the user to long-term memory.",
    input_schema: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The fact to remember" },
        category: {
          type: "string",
          enum: ["fact", "preference", "skill", "context", "goal"],
        },
        importance: { type: "number", description: "Importance 0-1" },
      },
      required: ["fact", "category"],
    },
  },
  {
    name: "calculator",
    description: "Evaluate mathematical expressions.",
    input_schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression to evaluate" },
      },
      required: ["expression"],
    },
  },
  {
    name: "get_device_info",
    description: "Get information about the device: battery, storage, network, time.",
    input_schema: {
      type: "object",
      properties: {
        info_type: {
          type: "string",
          enum: ["time", "date", "battery", "network", "storage", "all"],
        },
      },
      required: ["info_type"],
    },
  },
];

// ── Build message payload ─────────────────────────────────────────────────────

function buildContent(
  text: string,
  attachments?: Attachment[]
): any[] {
  const content: any[] = [];

  // Add images first
  if (attachments?.length) {
    for (const att of attachments) {
      if (att.type === "image" && att.base64) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: att.mimeType || "image/jpeg",
            data: att.base64,
          },
        });
      } else if (att.type === "file" && att.base64) {
        // Include file content as text
        content.push({
          type: "text",
          text: `[File: ${att.name}]\n${att.base64}`,
        });
      }
    }
  }

  content.push({ type: "text", text });
  return content;
}

function buildSystemPrompt(
  memories: MemoryEntry[],
  style: UserStyle,
  enabledTools: string[],
  customSystem?: string
): string {
  const styleGuide = `
RESPONSE STYLE:
- Tone: ${style.tone}
- Length: ${style.responseLength} responses
- Emoji: ${style.useEmoji ? "Use sparingly" : "Never use emoji"}
- Code: ${style.codeStyle} style
- Language: ${style.language}
`.trim();

  const memorySection =
    memories.length > 0
      ? `\nUSER MEMORY (what you know about this user):\n${memories
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 20)
          .map((m) => `• [${m.category}] ${m.content}`)
          .join("\n")}`
      : "";

  const toolsSection =
    enabledTools.length > 0
      ? `\nAVAILABLE TOOLS: ${enabledTools.join(", ")}. Use them proactively when helpful.`
      : "";

  const base = customSystem || `You are a powerful AI assistant running on the user's Android phone. You have access to the camera, files, web search, and device information. You are helpful, accurate, and adapt to the user's style.`;

  return `${base}\n\n${styleGuide}${memorySection}${toolsSection}`;
}

// ── Main API call ─────────────────────────────────────────────────────────────

export interface ChatOptions {
  apiKey: string;
  model?: ClaudeModel;
  messages: Message[];
  systemPrompt?: string;
  memories?: MemoryEntry[];
  style?: UserStyle;
  enableTools?: boolean;
  enabledToolNames?: string[];
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  extendedThinking?: boolean;
  onStream?: (chunk: string) => void;
  onToolCall?: (tool: string, input: any) => Promise<string>;
}

export async function chatWithClaude(opts: ChatOptions): Promise<{
  content: string;
  thinking?: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}> {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    messages,
    systemPrompt,
    memories = [],
    style = { tone: "friendly", responseLength: "medium", language: "English", useEmoji: false, codeStyle: "explained" },
    enableTools = true,
    enabledToolNames = ["web_search", "calculator", "remember", "get_device_info"],
    stream = false,
    maxTokens = 4096,
    temperature = 1,
    extendedThinking = false,
    onStream,
    onToolCall,
  } = opts;

  // Build API messages
  const apiMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content: buildContent(m.content, m.attachments),
    }));

  const system = buildSystemPrompt(
    memories,
    style,
    enabledToolNames,
    systemPrompt
  );

  const tools = enableTools
    ? CLAUDE_TOOLS.filter((t) => enabledToolNames.includes(t.name))
    : [];

  const body: any = {
    model,
    max_tokens: extendedThinking ? Math.max(maxTokens, 8000) : maxTokens,
    system,
    messages: apiMessages,
    stream,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: "auto" };
  }

  if (extendedThinking) {
    body.thinking = { type: "enabled", budget_tokens: 5000 };
    body.temperature = 1; // Required for extended thinking
  } else {
    body.temperature = temperature;
  }

  // ── Non-streaming request ────────────────────────────────────────────────
  if (!stream) {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": "interleaved-thinking-2025-05-14",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Claude API error ${response.status}: ${err?.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    return parseResponse(data, onToolCall, opts);
  }

  // ── Streaming request ────────────────────────────────────────────────────
  return streamResponse(body, apiKey, onStream, onToolCall, opts);
}

async function parseResponse(
  data: any,
  onToolCall?: (tool: string, input: any) => Promise<string>,
  opts?: ChatOptions
): Promise<{ content: string; thinking?: string; toolCalls: ToolCall[]; inputTokens: number; outputTokens: number }> {
  let content = "";
  let thinking: string | undefined;
  const toolCalls: ToolCall[] = [];

  for (const block of data.content || []) {
    if (block.type === "text") content += block.text;
    if (block.type === "thinking") thinking = block.thinking;
    if (block.type === "tool_use" && onToolCall) {
      const result = await onToolCall(block.name, block.input);
      toolCalls.push({ id: block.id, name: block.name, input: block.input, output: result });
    }
  }

  return {
    content,
    thinking,
    toolCalls,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

async function streamResponse(
  body: any,
  apiKey: string,
  onStream?: (chunk: string) => void,
  onToolCall?: (tool: string, input: any) => Promise<string>,
  opts?: ChatOptions
): Promise<{ content: string; thinking?: string; toolCalls: ToolCall[]; inputTokens: number; outputTokens: number }> {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": "interleaved-thinking-2025-05-14",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude API error ${response.status}: ${err?.error?.message}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let thinking = "";
  const toolCalls: ToolCall[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let currentToolName = "";
  let currentToolInput = "";
  let currentToolId = "";

  if (!reader) throw new Error("No response body");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") continue;

      try {
        const event = JSON.parse(jsonStr);

        if (event.type === "content_block_start") {
          if (event.content_block?.type === "tool_use") {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            currentToolInput = "";
          }
        }

        if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta") {
            content += delta.text;
            onStream?.(delta.text);
          }
          if (delta?.type === "thinking_delta") {
            thinking += delta.thinking;
          }
          if (delta?.type === "input_json_delta") {
            currentToolInput += delta.partial_json;
          }
        }

        if (event.type === "content_block_stop" && currentToolName && onToolCall) {
          try {
            const input = JSON.parse(currentToolInput || "{}");
            const result = await onToolCall(currentToolName, input);
            toolCalls.push({ id: currentToolId, name: currentToolName, input, output: result });
            currentToolName = "";
            currentToolInput = "";
          } catch {}
        }

        if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens || outputTokens;
        }
        if (event.type === "message_start") {
          inputTokens = event.message?.usage?.input_tokens || 0;
        }
      } catch {}
    }
  }

  return { content, thinking: thinking || undefined, toolCalls, inputTokens, outputTokens };
}
