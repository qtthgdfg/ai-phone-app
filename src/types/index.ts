// src/types/index.ts

export type Role = "user" | "assistant" | "system";

export interface Attachment {
  type: "image" | "file" | "audio";
  uri: string;
  name: string;
  base64?: string;
  mimeType?: string;
  size?: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  timestamp: number;
  tokens?: number;
  tool_calls?: ToolCall[];
  thinking?: string;       // Claude extended thinking
  model?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt?: string;
  tokenCount: number;
}

export interface UserProfile {
  name: string;
  style: UserStyle;
  preferences: UserPreferences;
  memory: MemoryEntry[];
  stats: UsageStats;
}

export interface UserStyle {
  tone: "formal" | "casual" | "technical" | "friendly" | "concise";
  responseLength: "short" | "medium" | "detailed";
  language: string;
  useEmoji: boolean;
  codeStyle: "commented" | "minimal" | "explained";
}

export interface UserPreferences {
  defaultModel: ClaudeModel;
  streamResponses: boolean;
  saveHistory: boolean;
  enableMemory: boolean;
  enableWebSearch: boolean;
  enableTools: boolean;
  theme: "dark" | "light" | "auto";
  fontSize: number;
  hapticFeedback: boolean;
  voiceInput: boolean;
  voiceOutput: boolean;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: "fact" | "preference" | "skill" | "context" | "goal";
  importance: number;        // 0-1
  embedding?: number[];      // for semantic search
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export interface UsageStats {
  totalMessages: number;
  totalTokensUsed: number;
  totalSearches: number;
  totalImages: number;
  sessionsCount: number;
  avgResponseTime: number;
  favoriteModel: string;
}

export type ClaudeModel =
  | "claude-opus-4-20250514"
  | "claude-sonnet-4-20250514"
  | "claude-haiku-4-5-20251001";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
}

export interface Tool {
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  category: "search" | "files" | "camera" | "system" | "custom";
}

export interface SystemStats {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  batteryLevel: number;
  networkType: string;
  storageUsed: number;
  storageTotal: number;
}
