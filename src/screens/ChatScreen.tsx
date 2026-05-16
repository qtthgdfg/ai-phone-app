// src/screens/ChatScreen.tsx
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Vibration, ScrollView, Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { chatWithClaude } from "../services/claude";
import { executeTool } from "../services/tools";
import {
  getMemories, saveConversation, loadUserProfile,
  defaultUserProfile, updateStats, saveFinetuneExample,
} from "../services/memory";
import { Message, Attachment, Conversation, UserProfile } from "../types";

const COLORS = {
  bg: "#0a0a0f",
  surface: "#13131a",
  surfaceHigh: "#1c1c28",
  accent: "#6c63ff",
  accentDim: "#3d3885",
  text: "#e8e8f0",
  textDim: "#8888aa",
  user: "#1a1a2e",
  assistant: "#0f1a2e",
  tool: "#0a1a14",
  error: "#ff4466",
  success: "#22c55e",
  border: "#2a2a3d",
};

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [profile, setProfile] = useState<UserProfile>(defaultUserProfile());
  const [convId] = useState(genId);
  const [streamBuffer, setStreamBuffer] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const streamRef = useRef("");

  useEffect(() => {
    loadUserProfile().then((p) => p && setProfile(p));
    updateStats({ sessionsCount: 1 });
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ── Send message ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (!profile.preferences.defaultModel) return;

    const apiKey = await getApiKey();
    if (!apiKey) {
      Alert.alert("API Key Required", "Please add your Claude API key in Settings.");
      return;
    }

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setLoading(true);
    streamRef.current = "";
    scrollToBottom();

    // Placeholder assistant message for streaming
    const assistantId = genId();
    const placeholderMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, placeholderMsg]);

    try {
      const memories = await getMemories(20);
      const searchApiKey = await AsyncStorage.getItem("@search_api_key") || "";
      const startTime = Date.now();

      const result = await chatWithClaude({
        apiKey,
        model: profile.preferences.defaultModel,
        messages: [...messages, userMsg],
        memories: profile.preferences.enableMemory ? memories : [],
        style: profile.style,
        enableTools: profile.preferences.enableTools,
        enabledToolNames: profile.preferences.enableWebSearch
          ? ["web_search", "calculator", "remember", "get_device_info", "analyze_image"]
          : ["calculator", "remember", "get_device_info", "analyze_image"],
        stream: profile.preferences.streamResponses,
        extendedThinking: false,
        onStream: (chunk) => {
          streamRef.current += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: streamRef.current }
                : m
            )
          );
          scrollToBottom();
        },
        onToolCall: async (toolName, toolInput) => {
          // Show tool indicator
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: streamRef.current + `\n\n⚙️ *Using ${toolName}...*` }
                : m
            )
          );
          const output = await executeTool(toolName, toolInput, {
            apiKey,
            searchApiKey,
          });
          if (toolName === "web_search") await updateStats({ totalSearches: 1 });
          return output;
        },
      });

      const elapsed = Date.now() - startTime;

      // Update final message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: result.content,
                thinking: result.thinking,
                tool_calls: result.toolCalls,
                tokens: result.outputTokens,
              }
            : m
        )
      );

      // Track stats
      await updateStats({
        totalMessages: 2,
        totalTokensUsed: result.inputTokens + result.outputTokens,
        avgResponseTime: elapsed,
        totalImages: attachments.filter((a) => a.type === "image").length,
      });

      // Auto-save fine-tuning data (high-quality examples)
      if (text && result.content && result.content.length > 100) {
        await saveFinetuneExample(text, result.content, 5);
      }

      if (profile.preferences.hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${err.message || "Unknown error"}` }
            : m
        )
      );
      if (profile.preferences.hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      scrollToBottom();
    }
  }, [input, attachments, messages, profile]);

  // ── Attachments ─────────────────────────────────────────────────────────

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
      allowsMultipleSelection: true,
    });

    if (!result.canceled) {
      const newAtts: Attachment[] = result.assets.map((a) => ({
        type: "image",
        uri: a.uri,
        name: a.fileName || "image.jpg",
        base64: a.base64 || undefined,
        mimeType: a.mimeType || "image/jpeg",
        size: a.fileSize,
      }));
      setAttachments((prev) => [...prev, ...newAtts]);
      await updateStats({ totalImages: newAtts.length });
    }
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (!result.canceled) {
      const newAtts: Attachment[] = await Promise.all(
        result.assets.map(async (a) => {
          let base64: string | undefined;
          if (a.size && a.size < 1024 * 1024 * 5) {
            // Read text files as base64
            base64 = await FileSystem.readAsStringAsync(a.uri, {
              encoding: FileSystem.EncodingType.UTF8,
            }).catch(() => undefined);
          }
          return {
            type: "file" as const,
            uri: a.uri,
            name: a.name,
            base64,
            mimeType: a.mimeType || "application/octet-stream",
            size: a.size,
          };
        })
      );
      setAttachments((prev) => [...prev, ...newAtts]);
    }
  };

  // ── Message rendering ────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    const isLoading = loading && item.content === "" && !isUser;

    return (
      <View style={[styles.msgWrapper, isUser ? styles.msgRight : styles.msgLeft]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={14} color={COLORS.accent} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
            isLoading && styles.bubbleLoading,
          ]}
        >
          {/* Attachments */}
          {item.attachments?.map((att, i) =>
            att.type === "image" ? (
              <Image
                key={i}
                source={{ uri: att.uri }}
                style={styles.attachmentImage}
                resizeMode="cover"
              />
            ) : (
              <View key={i} style={styles.fileChip}>
                <Ionicons name="document" size={12} color={COLORS.accent} />
                <Text style={styles.fileChipText} numberOfLines={1}>{att.name}</Text>
              </View>
            )
          )}

          {/* Thinking block */}
          {item.thinking && (
            <View style={styles.thinkingBox}>
              <Text style={styles.thinkingLabel}>💭 Extended thinking</Text>
              <Text style={styles.thinkingText} numberOfLines={3}>{item.thinking}</Text>
            </View>
          )}

          {/* Tool calls */}
          {item.tool_calls?.map((tc, i) => (
            <View key={i} style={styles.toolCallBox}>
              <Text style={styles.toolCallLabel}>⚙️ {tc.name}</Text>
              {tc.output && (
                <Text style={styles.toolCallOutput} numberOfLines={3}>{tc.output}</Text>
              )}
            </View>
          ))}

          {/* Content */}
          {isLoading ? (
            <View style={styles.typingRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.dot, { opacity: 0.3 + i * 0.25 }]} />
              ))}
            </View>
          ) : (
            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
              {item.content}
            </Text>
          )}

          <Text style={styles.timestamp}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {item.tokens ? `  ·  ${item.tokens} tokens` : ""}
          </Text>
        </View>
      </View>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToBottom}
        ListEmptyComponent={<EmptyChat />}
      />

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <ScrollView horizontal style={styles.attRow} showsHorizontalScrollIndicator={false}>
          {attachments.map((a, i) => (
            <View key={i} style={styles.attChip}>
              {a.type === "image" ? (
                <Image source={{ uri: a.uri }} style={styles.attThumb} />
              ) : (
                <Ionicons name="document" size={20} color={COLORS.accent} />
              )}
              <TouchableOpacity
                style={styles.attRemove}
                onPress={() => setAttachments((p) => p.filter((_, j) => j !== i))}
              >
                <Ionicons name="close-circle" size={16} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
          <Ionicons name="image" size={22} color={COLORS.textDim} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={pickFile}>
          <Ionicons name="attach" size={22} color={COLORS.textDim} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask anything…"
          placeholderTextColor={COLORS.textDim}
          multiline
          maxLength={4000}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function EmptyChat() {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="sparkles" size={48} color={COLORS.accent} />
      <Text style={styles.emptyTitle}>AI Assistant</Text>
      <Text style={styles.emptySubtitle}>
        Powered by Claude · Camera · Web Search · Files
      </Text>
      <View style={styles.capabilityRow}>
        {[
          { icon: "camera", label: "Camera" },
          { icon: "search", label: "Search" },
          { icon: "document", label: "Files" },
          { icon: "code-slash", label: "Code" },
          { icon: "brain", label: "Memory" },
        ].map((cap) => (
          <View key={cap.label} style={styles.capChip}>
            <Ionicons name={cap.icon as any} size={14} color={COLORS.accent} />
            <Text style={styles.capChipText}>{cap.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

async function getApiKey(): Promise<string | null> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  return AsyncStorage.getItem("@claude_api_key");
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 12, paddingBottom: 4 },

  msgWrapper: { flexDirection: "row", marginVertical: 4, alignItems: "flex-end" },
  msgLeft: { justifyContent: "flex-start" },
  msgRight: { justifyContent: "flex-end" },

  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.accentDim,
    alignItems: "center", justifyContent: "center", marginRight: 6,
  },
  bubble: {
    maxWidth: "80%", borderRadius: 16, padding: 12,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  bubbleUser: { backgroundColor: COLORS.user, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: COLORS.assistant, borderBottomLeftRadius: 4 },
  bubbleLoading: { opacity: 0.7 },

  bubbleText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: "#d0d0ff" },

  attachmentImage: { width: 200, height: 140, borderRadius: 8, marginBottom: 8 },
  fileChip: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surfaceHigh,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6, gap: 4,
  },
  fileChipText: { color: COLORS.textDim, fontSize: 11, maxWidth: 180 },

  thinkingBox: {
    backgroundColor: "#1a1428", borderRadius: 8, padding: 8,
    marginBottom: 8, borderLeftWidth: 2, borderLeftColor: "#a855f7",
  },
  thinkingLabel: { color: "#a855f7", fontSize: 11, fontWeight: "600", marginBottom: 4 },
  thinkingText: { color: "#c4b5fd", fontSize: 11 },

  toolCallBox: {
    backgroundColor: COLORS.tool, borderRadius: 8, padding: 8,
    marginBottom: 8, borderLeftWidth: 2, borderLeftColor: COLORS.success,
  },
  toolCallLabel: { color: COLORS.success, fontSize: 11, fontWeight: "600", marginBottom: 4 },
  toolCallOutput: { color: "#86efac", fontSize: 11 },

  typingRow: { flexDirection: "row", gap: 4, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },

  timestamp: { color: COLORS.textDim, fontSize: 10, marginTop: 6, alignSelf: "flex-end" },

  attRow: { backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 8 },
  attChip: { marginRight: 8, position: "relative" },
  attThumb: { width: 60, height: 60, borderRadius: 8 },
  attRemove: { position: "absolute", top: -4, right: -4 },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", padding: 8,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
    gap: 6,
  },
  iconBtn: { padding: 8, alignSelf: "flex-end" },
  input: {
    flex: 1, color: COLORS.text, fontSize: 15, maxHeight: 120,
    backgroundColor: COLORS.surfaceHigh, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: COLORS.accentDim },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700", marginTop: 12 },
  emptySubtitle: { color: COLORS.textDim, fontSize: 14, textAlign: "center" },
  capabilityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 },
  capChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.surfaceHigh, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  capChipText: { color: COLORS.textDim, fontSize: 12 },
});
