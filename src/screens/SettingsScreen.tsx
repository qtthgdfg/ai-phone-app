// src/screens/SettingsScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, Switch, TouchableOpacity,
  ScrollView, StyleSheet, Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { loadUserProfile, saveUserProfile, defaultUserProfile, getStats, getMemories, deleteMemory } from "../services/memory";
import { UserProfile, UserStyle, ClaudeModel } from "../types";

const COLORS = {
  bg: "#0a0a0f", surface: "#13131a", surfaceHigh: "#1c1c28",
  accent: "#6c63ff", text: "#e8e8f0", textDim: "#8888aa",
  border: "#2a2a3d", success: "#22c55e", error: "#ff4466",
};

const MODELS: { label: string; value: ClaudeModel; desc: string }[] = [
  { label: "Claude Opus 4", value: "claude-opus-4-20250514", desc: "Most capable · Slower · Higher cost" },
  { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514", desc: "Best balance · Recommended" },
  { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001", desc: "Fastest · Most affordable" },
];

export default function SettingsScreen() {
  const [claudeKey, setClaudeKey] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [profile, setProfile] = useState<UserProfile>(defaultUserProfile());
  const [stats, setStats] = useState<any>(null);
  const [memCount, setMemCount] = useState(0);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showSearchKey, setShowSearchKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [ck, sk, p, s, mems] = await Promise.all([
      AsyncStorage.getItem("@claude_api_key"),
      AsyncStorage.getItem("@search_api_key"),
      loadUserProfile(),
      getStats(),
      getMemories(100),
    ]);
    if (ck) setClaudeKey(ck);
    if (sk) setSearchKey(sk);
    if (p) setProfile(p);
    setStats(s);
    setMemCount(mems.length);
  }

  async function save() {
    await Promise.all([
      AsyncStorage.setItem("@claude_api_key", claudeKey.trim()),
      AsyncStorage.setItem("@search_api_key", searchKey.trim()),
      saveUserProfile(profile),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateStyle(patch: Partial<UserStyle>) {
    setProfile((p) => ({ ...p, style: { ...p.style, ...patch } }));
  }

  function updatePref(key: string, val: any) {
    setProfile((p) => ({ ...p, preferences: { ...p.preferences, [key]: val } }));
  }

  async function clearAllMemory() {
    Alert.alert("Clear Memory", "Delete all memories? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: async () => {
          const mems = await getMemories(500);
          await Promise.all(mems.map((m) => deleteMemory(m.id)));
          setMemCount(0);
        },
      },
    ]);
  }

  const Section = ({ title }: { title: string }) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* API Keys */}
      <Section title="🔑  API Keys" />
      <View style={styles.card}>
        <Text style={styles.keyLabel}>Claude API Key (Anthropic)</Text>
        <Text style={styles.keyHint}>Get free at console.anthropic.com</Text>
        <View style={styles.keyRow}>
          <TextInput
            style={styles.keyInput}
            value={claudeKey}
            onChangeText={setClaudeKey}
            placeholder="sk-ant-..."
            placeholderTextColor={COLORS.textDim}
            secureTextEntry={!showClaudeKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowClaudeKey(!showClaudeKey)} style={styles.eyeBtn}>
            <Ionicons name={showClaudeKey ? "eye-off" : "eye"} size={20} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.keyLabel, { marginTop: 16 }]}>Brave Search API Key (Optional)</Text>
        <Text style={styles.keyHint}>Free tier: api.search.brave.com · 2000 req/month</Text>
        <View style={styles.keyRow}>
          <TextInput
            style={styles.keyInput}
            value={searchKey}
            onChangeText={setSearchKey}
            placeholder="BSA..."
            placeholderTextColor={COLORS.textDim}
            secureTextEntry={!showSearchKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowSearchKey(!showSearchKey)} style={styles.eyeBtn}>
            <Ionicons name={showSearchKey ? "eye-off" : "eye"} size={20} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Model selection */}
      <Section title="🤖  Model" />
      <View style={styles.card}>
        {MODELS.map((m) => (
          <TouchableOpacity
            key={m.value}
            style={[
              styles.modelRow,
              profile.preferences.defaultModel === m.value && styles.modelRowActive,
            ]}
            onPress={() => updatePref("defaultModel", m.value)}
          >
            <View style={styles.modelRadio}>
              {profile.preferences.defaultModel === m.value && (
                <View style={styles.modelRadioInner} />
              )}
            </View>
            <View style={styles.modelInfo}>
              <Text style={styles.modelLabel}>{m.label}</Text>
              <Text style={styles.modelDesc}>{m.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Response style */}
      <Section title="🎨  Your Style" />
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Tone</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {(["casual", "friendly", "formal", "technical", "concise"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, profile.style.tone === t && styles.chipActive]}
                onPress={() => updateStyle({ tone: t })}
              >
                <Text style={[styles.chipText, profile.style.tone === t && styles.chipTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Response Length</Text>
        <View style={styles.chipRow}>
          {(["short", "medium", "detailed"] as const).map((l) => (
            <TouchableOpacity
              key={l}
              style={[styles.chip, profile.style.responseLength === l && styles.chipActive]}
              onPress={() => updateStyle({ responseLength: l })}
            >
              <Text style={[styles.chipText, profile.style.responseLength === l && styles.chipTextActive]}>
                {l}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Code Style</Text>
        <View style={styles.chipRow}>
          {(["commented", "minimal", "explained"] as const).map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, profile.style.codeStyle === c && styles.chipActive]}
              onPress={() => updateStyle({ codeStyle: c })}
            >
              <Text style={[styles.chipText, profile.style.codeStyle === c && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Features */}
      <Section title="⚙️  Features" />
      <View style={styles.card}>
        {[
          { key: "streamResponses",  label: "Stream responses",     desc: "Show text as it arrives" },
          { key: "enableMemory",     label: "Long-term memory",     desc: "AI remembers facts about you" },
          { key: "enableWebSearch",  label: "Web search",           desc: "Search internet automatically" },
          { key: "enableTools",      label: "Tool use",             desc: "Calculator, device info, etc." },
          { key: "saveHistory",      label: "Save chat history",    desc: "Store conversations locally" },
          { key: "hapticFeedback",   label: "Haptic feedback",      desc: "Vibrate on send/receive" },
          { key: "voiceInput",       label: "Voice input",          desc: "Speak your messages" },
          { key: "voiceOutput",      label: "Read responses aloud", desc: "Text-to-speech output" },
        ].map(({ key, label, desc }) => (
          <Row key={key} label="">
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>{label}</Text>
                <Text style={styles.toggleDesc}>{desc}</Text>
              </View>
              <Switch
                value={(profile.preferences as any)[key]}
                onValueChange={(v) => updatePref(key, v)}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor="#fff"
              />
            </View>
          </Row>
        ))}
      </View>

      {/* Memory stats */}
      <Section title="🧠  Memory" />
      <View style={styles.card}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Stored memories</Text>
          <Text style={styles.statValue}>{memCount}</Text>
        </View>
        {stats && (
          <>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total messages</Text>
              <Text style={styles.statValue}>{stats.totalMessages?.toLocaleString()}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Tokens used</Text>
              <Text style={styles.statValue}>{stats.totalTokensUsed?.toLocaleString()}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Searches</Text>
              <Text style={styles.statValue}>{stats.totalSearches}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Images analyzed</Text>
              <Text style={styles.statValue}>{stats.totalImages}</Text>
            </View>
          </>
        )}
        <TouchableOpacity style={styles.dangerBtn} onPress={clearAllMemory}>
          <Ionicons name="trash" size={16} color={COLORS.error} />
          <Text style={styles.dangerBtnText}>Clear All Memory</Text>
        </TouchableOpacity>
      </View>

      {/* Save */}
      <TouchableOpacity style={[styles.saveBtn, saved && styles.saveBtnSuccess]} onPress={save}>
        <Ionicons name={saved ? "checkmark-circle" : "save"} size={20} color="#fff" />
        <Text style={styles.saveBtnText}>{saved ? "Saved!" : "Save Settings"}</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16 },
  sectionTitle: { color: COLORS.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 4, borderWidth: 1, borderColor: COLORS.border },

  keyLabel: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  keyHint: { color: COLORS.textDim, fontSize: 11, marginBottom: 8 },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  keyInput: {
    flex: 1, color: COLORS.text, fontSize: 13,
    backgroundColor: COLORS.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  eyeBtn: { padding: 8 },

  modelRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modelRowActive: { borderColor: COLORS.accent, backgroundColor: "#1a1a2e" },
  modelRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.accent,
    alignItems: "center", justifyContent: "center",
  },
  modelRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  modelInfo: { flex: 1 },
  modelLabel: { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  modelDesc: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },

  fieldLabel: { color: COLORS.textDim, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { color: COLORS.textDim, fontSize: 12 },
  chipTextActive: { color: "#fff", fontWeight: "600" },

  row: { marginBottom: 4 },
  rowLabel: { color: COLORS.textDim, fontSize: 12, marginBottom: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, justifyContent: "space-between" },
  toggleInfo: { flex: 1 },
  toggleLabel: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  toggleDesc: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },

  statRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  statLabel: { color: COLORS.textDim, fontSize: 14 },
  statValue: { color: COLORS.text, fontSize: 14, fontWeight: "700" },

  dangerBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 16, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.error,
    justifyContent: "center",
  },
  dangerBtnText: { color: COLORS.error, fontSize: 14, fontWeight: "600" },

  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingVertical: 16, marginTop: 20,
  },
  saveBtnSuccess: { backgroundColor: COLORS.success },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
