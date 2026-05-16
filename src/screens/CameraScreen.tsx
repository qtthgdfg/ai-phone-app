// src/screens/CameraScreen.tsx
import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Image, Alert,
} from "react-native";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { chatWithClaude } from "../services/claude";
import { updateStats } from "../services/memory";

const COLORS = {
  bg: "#0a0a0f", surface: "#13131a", accent: "#6c63ff",
  text: "#e8e8f0", textDim: "#8888aa", border: "#2a2a3d",
  success: "#22c55e", error: "#ff4466",
};

const ANALYSIS_MODES = [
  { id: "describe",   icon: "eye",           label: "Describe",  prompt: "Describe this image in detail." },
  { id: "ocr",        icon: "text",          label: "Read Text", prompt: "Extract and transcribe all text visible in this image." },
  { id: "identify",   icon: "search-circle", label: "Identify",  prompt: "What objects, animals, plants, or products are in this image? Identify everything you can." },
  { id: "code",       icon: "code-slash",    label: "Read Code", prompt: "Extract and explain the code or diagram shown in this image." },
  { id: "translate",  icon: "language",      label: "Translate", prompt: "Translate all text in this image to English and explain the context." },
  { id: "solve",      icon: "calculator",    label: "Solve",     prompt: "Solve the problem, equation, or puzzle shown in this image. Show your work." },
  { id: "analyze_doc",icon: "document-text", label: "Document",  prompt: "Analyze this document. Extract key information, dates, names, and important details." },
  { id: "custom",     icon: "create",        label: "Custom",    prompt: "" },
];

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [mode, setMode] = useState(ANALYSIS_MODES[0]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const cameraRef = useRef<CameraView>(null);

  const capture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });
      if (photo) {
        setCapturedImage(photo.uri);
        setCapturedBase64(photo.base64 || null);
        setResult("");
      }
    } catch (e) {
      Alert.alert("Camera Error", String(e));
    }
  }, []);

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (!res.canceled && res.assets[0]) {
      setCapturedImage(res.assets[0].uri);
      setCapturedBase64(res.assets[0].base64 || null);
      setResult("");
    }
  };

  const analyze = async () => {
    if (!capturedBase64) return;
    const apiKey = await AsyncStorage.getItem("@claude_api_key");
    if (!apiKey) {
      Alert.alert("No API Key", "Add your Claude API key in Settings.");
      return;
    }

    setAnalyzing(true);
    setResult("");

    try {
      const prompt = mode.id === "custom" ? customPrompt : mode.prompt;
      const res = await chatWithClaude({
        apiKey,
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            id: "img_msg",
            role: "user",
            content: prompt || "Describe this image.",
            attachments: [
              {
                type: "image",
                uri: capturedImage!,
                name: "camera.jpg",
                base64: capturedBase64,
                mimeType: "image/jpeg",
              },
            ],
            timestamp: Date.now(),
          },
        ],
        enableTools: false,
        stream: false,
        maxTokens: 2048,
      });
      setResult(res.content);
      await updateStats({ totalImages: 1 });
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permContainer}>
        <Ionicons name="camera-outline" size={64} color={COLORS.accent} />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permText}>
          Allow camera access to analyze images with AI.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera or captured image */}
      {capturedImage ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.preview} resizeMode="contain" />
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => { setCapturedImage(null); setCapturedBase64(null); setResult(""); }}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.analyzeBtn, analyzing && styles.analyzeBtnDisabled]}
              onPress={analyze}
              disabled={analyzing}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={styles.analyzeBtnText}>Analyze</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Result */}
          {result ? (
            <ScrollView style={styles.resultBox}>
              <Text style={styles.resultLabel}>{mode.label} Result</Text>
              <Text style={styles.resultText}>{result}</Text>
            </ScrollView>
          ) : null}
        </View>
      ) : (
        <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
          <View style={styles.cameraOverlay}>
            <View style={styles.focusFrame} />
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity onPress={pickFromLibrary} style={styles.camBtn}>
              <Ionicons name="images" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={capture} style={styles.captureBtn}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFacing(f => f === "back" ? "front" : "back")}
              style={styles.camBtn}
            >
              <Ionicons name="camera-reverse" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </CameraView>
      )}

      {/* Mode selector */}
      <View style={styles.modeContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
          {ANALYSIS_MODES.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.modeChip, mode.id === m.id && styles.modeChipActive]}
              onPress={() => setMode(m)}
            >
              <Ionicons name={m.icon as any} size={14} color={mode.id === m.id ? "#fff" : COLORS.textDim} />
              <Text style={[styles.modeLabel, mode.id === m.id && styles.modeLabelActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  focusFrame: {
    width: 240, height: 240, borderRadius: 16,
    borderWidth: 2, borderColor: "rgba(108,99,255,0.7)",
  },
  cameraControls: {
    flexDirection: "row", justifyContent: "space-around", alignItems: "center",
    paddingHorizontal: 32, paddingBottom: 20, backgroundColor: "rgba(0,0,0,0.5)",
  },
  camBtn: { padding: 12 },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },

  previewContainer: { flex: 1 },
  preview: { flex: 1, backgroundColor: "#000" },
  previewActions: {
    flexDirection: "row", gap: 12, padding: 12,
    backgroundColor: COLORS.surface,
  },
  retakeBtn: {
    flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.border, borderRadius: 12, paddingVertical: 12,
  },
  retakeBtnText: { color: COLORS.text, fontWeight: "600" },
  analyzeBtn: {
    flex: 2, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 12,
  },
  analyzeBtnDisabled: { opacity: 0.6 },
  analyzeBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  resultBox: {
    maxHeight: 280, backgroundColor: COLORS.surface,
    padding: 14, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  resultLabel: { color: COLORS.accent, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  resultText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },

  modeContainer: { backgroundColor: COLORS.surface, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  modeRow: { paddingHorizontal: 12, gap: 8 },
  modeChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: COLORS.bg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modeChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  modeLabel: { color: COLORS.textDim, fontSize: 12 },
  modeLabelActive: { color: "#fff", fontWeight: "600" },

  permContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  permTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  permText: { color: COLORS.textDim, fontSize: 15, textAlign: "center" },
  permBtn: { backgroundColor: COLORS.accent, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
