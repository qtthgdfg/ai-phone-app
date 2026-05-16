// src/services/memory.ts
// On-device SQLite memory system — stores facts, preferences, conversation history
// The model "learns" the user over time via injected context

import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MemoryEntry, Conversation, Message, UserProfile, UsageStats } from "../types";

let db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("ai_assistant.db");
    await initSchema(db);
  }
  return db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      category    TEXT NOT NULL,
      importance  REAL DEFAULT 0.5,
      created_at  INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      model       TEXT NOT NULL,
      system_prompt TEXT,
      token_count INTEGER DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      attachments     TEXT,
      tool_calls      TEXT,
      thinking        TEXT,
      timestamp       INTEGER NOT NULL,
      tokens          INTEGER DEFAULT 0,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS fine_tune_data (
      id          TEXT PRIMARY KEY,
      prompt      TEXT NOT NULL,
      response    TEXT NOT NULL,
      rating      INTEGER DEFAULT 5,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_memories_cat  ON memories(category);
  `);
}

// ── Memories ─────────────────────────────────────────────────────────────────

export async function saveMemory(
  entry: Omit<MemoryEntry, "id" | "createdAt" | "accessCount" | "lastAccessed">
): Promise<string> {
  const database = await getDB();
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  await database.runAsync(
    `INSERT OR REPLACE INTO memories (id, content, category, importance, created_at, access_count, last_accessed)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, entry.content, entry.category, entry.importance ?? 0.5, now, now]
  );

  return id;
}

export async function getMemories(
  limit: number = 30,
  category?: string
): Promise<MemoryEntry[]> {
  const database = await getDB();

  const rows = category
    ? await database.getAllAsync<any>(
        `SELECT * FROM memories WHERE category = ? ORDER BY importance DESC, last_accessed DESC LIMIT ?`,
        [category, limit]
      )
    : await database.getAllAsync<any>(
        `SELECT * FROM memories ORDER BY importance DESC, last_accessed DESC LIMIT ?`,
        [limit]
      );

  // Update access time
  if (rows.length > 0) {
    const ids = rows.map((r: any) => `'${r.id}'`).join(",");
    await database.execAsync(
      `UPDATE memories SET access_count = access_count + 1, last_accessed = ${Date.now()} WHERE id IN (${ids})`
    );
  }

  return rows.map((r: any) => ({
    id: r.id,
    content: r.content,
    category: r.category,
    importance: r.importance,
    createdAt: r.created_at,
    accessCount: r.access_count,
    lastAccessed: r.last_accessed,
  }));
}

export async function deleteMemory(id: string): Promise<void> {
  const database = await getDB();
  await database.runAsync("DELETE FROM memories WHERE id = ?", [id]);
}

export async function searchMemories(query: string): Promise<MemoryEntry[]> {
  const database = await getDB();
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM memories WHERE content LIKE ? ORDER BY importance DESC LIMIT 10`,
    [`%${query}%`]
  );
  return rows.map((r: any) => ({
    id: r.id,
    content: r.content,
    category: r.category,
    importance: r.importance,
    createdAt: r.created_at,
    accessCount: r.access_count,
    lastAccessed: r.last_accessed,
  }));
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function saveConversation(conv: Conversation): Promise<void> {
  const database = await getDB();

  await database.runAsync(
    `INSERT OR REPLACE INTO conversations (id, title, model, system_prompt, token_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [conv.id, conv.title, conv.model, conv.systemPrompt || null, conv.tokenCount, conv.createdAt, conv.updatedAt]
  );

  for (const msg of conv.messages) {
    await database.runAsync(
      `INSERT OR REPLACE INTO messages (id, conversation_id, role, content, attachments, tool_calls, thinking, timestamp, tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.id,
        conv.id,
        msg.role,
        msg.content,
        msg.attachments ? JSON.stringify(msg.attachments) : null,
        msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
        msg.thinking || null,
        msg.timestamp,
        msg.tokens || 0,
      ]
    );
  }
}

export async function loadConversations(): Promise<Conversation[]> {
  const database = await getDB();
  const convRows = await database.getAllAsync<any>(
    `SELECT * FROM conversations ORDER BY updated_at DESC`
  );

  const conversations: Conversation[] = [];

  for (const row of convRows) {
    const msgRows = await database.getAllAsync<any>(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`,
      [row.id]
    );

    conversations.push({
      id: row.id,
      title: row.title,
      model: row.model,
      systemPrompt: row.system_prompt,
      tokenCount: row.token_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: msgRows.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
        tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
        thinking: m.thinking,
        timestamp: m.timestamp,
        tokens: m.tokens,
      })),
    });
  }

  return conversations;
}

export async function deleteConversation(id: string): Promise<void> {
  const database = await getDB();
  await database.runAsync("DELETE FROM conversations WHERE id = ?", [id]);
}

// ── Fine-tuning data collection ───────────────────────────────────────────────

export async function saveFinetuneExample(
  prompt: string,
  response: string,
  rating: number = 5
): Promise<void> {
  const database = await getDB();
  const id = `ft_${Date.now()}`;
  await database.runAsync(
    `INSERT INTO fine_tune_data (id, prompt, response, rating, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, prompt, response, rating, Date.now()]
  );
}

export async function exportFinetuneData(): Promise<string> {
  const database = await getDB();
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM fine_tune_data WHERE rating >= 4 ORDER BY created_at`
  );

  const jsonl = rows
    .map((r: any) =>
      JSON.stringify({
        messages: [
          { role: "user", content: r.prompt },
          { role: "assistant", content: r.response },
        ],
      })
    )
    .join("\n");

  return jsonl;
}

// ── User profile ─────────────────────────────────────────────────────────────

const PROFILE_KEY = "@ai_app_profile";

export async function loadUserProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function defaultUserProfile(): UserProfile {
  return {
    name: "User",
    style: {
      tone: "friendly",
      responseLength: "medium",
      language: "English",
      useEmoji: false,
      codeStyle: "explained",
    },
    preferences: {
      defaultModel: "claude-sonnet-4-20250514",
      streamResponses: true,
      saveHistory: true,
      enableMemory: true,
      enableWebSearch: true,
      enableTools: true,
      theme: "dark",
      fontSize: 15,
      hapticFeedback: true,
      voiceInput: false,
      voiceOutput: false,
    },
    memory: [],
    stats: {
      totalMessages: 0,
      totalTokensUsed: 0,
      totalSearches: 0,
      totalImages: 0,
      sessionsCount: 0,
      avgResponseTime: 0,
      favoriteModel: "claude-sonnet-4-20250514",
    },
  };
}

// ── Stats tracking ─────────────────────────────────────────────────────────────

const STATS_KEY = "@ai_app_stats";

export async function updateStats(delta: Partial<UsageStats>): Promise<void> {
  const raw = await AsyncStorage.getItem(STATS_KEY);
  const stats: UsageStats = raw
    ? JSON.parse(raw)
    : { totalMessages: 0, totalTokensUsed: 0, totalSearches: 0, totalImages: 0, sessionsCount: 0, avgResponseTime: 0, favoriteModel: "" };

  Object.entries(delta).forEach(([k, v]) => {
    if (typeof v === "number" && k !== "avgResponseTime") {
      (stats as any)[k] = ((stats as any)[k] || 0) + v;
    } else {
      (stats as any)[k] = v;
    }
  });

  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export async function getStats(): Promise<UsageStats> {
  const raw = await AsyncStorage.getItem(STATS_KEY);
  return raw
    ? JSON.parse(raw)
    : { totalMessages: 0, totalTokensUsed: 0, totalSearches: 0, totalImages: 0, sessionsCount: 0, avgResponseTime: 0, favoriteModel: "" };
}
