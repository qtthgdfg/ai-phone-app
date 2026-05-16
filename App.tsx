// App.tsx — Root with bottom tab navigation
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ChatScreen from "./src/screens/ChatScreen";
import CameraScreen from "./src/screens/CameraScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator();

const COLORS = {
  bg: "#0a0a0f",
  surface: "#13131a",
  accent: "#6c63ff",
  text: "#e8e8f0",
  textDim: "#8888aa",
  border: "#2a2a3d",
};

// ── History Screen (conversations list) ────────────────────────────────────
import { loadConversations, deleteConversation } from "./src/services/memory";
import { Conversation } from "./src/types";

function HistoryScreen() {
  const [convs, setConvs] = React.useState<Conversation[]>([]);

  React.useEffect(() => {
    loadConversations().then(setConvs);
  }, []);

  const renderItem = ({ item }: { item: Conversation }) => (
    <View style={histStyles.item}>
      <View style={histStyles.itemInfo}>
        <Text style={histStyles.itemTitle} numberOfLines={1}>{item.title || "Untitled"}</Text>
        <Text style={histStyles.itemMeta}>
          {item.messages.length} messages · {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
        {item.messages[item.messages.length - 1]?.content && (
          <Text style={histStyles.itemPreview} numberOfLines={2}>
            {item.messages[item.messages.length - 1].content}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => {
          deleteConversation(item.id);
          setConvs((prev) => prev.filter((c) => c.id !== item.id));
        }}
        style={histStyles.deleteBtn}
      >
        <Ionicons name="trash-outline" size={18} color="#ff4466" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={histStyles.container}>
      <FlatList
        data={convs}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={histStyles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textDim} />
            <Text style={histStyles.emptyText}>No saved conversations</Text>
          </View>
        }
      />
    </View>
  );
}

const histStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  item: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  itemInfo: { flex: 1 },
  itemTitle: { color: COLORS.text, fontWeight: "700", fontSize: 15 },
  itemMeta: { color: COLORS.textDim, fontSize: 11, marginTop: 4 },
  itemPreview: { color: COLORS.textDim, fontSize: 12, marginTop: 6 },
  deleteBtn: { padding: 8 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { color: COLORS.textDim, fontSize: 16 },
});

// ── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: COLORS.surface, shadowColor: "transparent" },
            headerTintColor: COLORS.text,
            headerTitleStyle: { fontWeight: "700" },
            tabBarStyle: {
              backgroundColor: COLORS.surface,
              borderTopColor: COLORS.border,
              paddingBottom: 4,
            },
            tabBarActiveTintColor: COLORS.accent,
            tabBarInactiveTintColor: COLORS.textDim,
            tabBarIcon: ({ focused, color, size }) => {
              const icons: Record<string, [string, string]> = {
                Chat:     ["chatbubble-ellipses", "chatbubble-ellipses-outline"],
                Camera:   ["camera",              "camera-outline"],
                History:  ["time",                "time-outline"],
                Settings: ["settings",            "settings-outline"],
              };
              const [active, inactive] = icons[route.name] || ["help", "help-outline"];
              return <Ionicons name={(focused ? active : inactive) as any} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen
            name="Chat"
            component={ChatScreen}
            options={{ title: "AI Assistant", tabBarLabel: "Chat" }}
          />
          <Tab.Screen
            name="Camera"
            component={CameraScreen}
            options={{ title: "Camera AI", tabBarLabel: "Camera" }}
          />
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            options={{ title: "History", tabBarLabel: "History" }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: "Settings", tabBarLabel: "Settings" }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
