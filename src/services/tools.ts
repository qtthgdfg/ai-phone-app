// src/services/tools.ts
// Executes tool calls from Claude on the device

import * as FileSystem from "expo-file-system";
import * as Battery from "expo-battery";
import * as Network from "expo-network";
import { webSearch, formatSearchResults } from "./search";
import { saveMemory } from "./memory";

export interface ToolExecutor {
  apiKey: string;
  searchApiKey: string;
}

export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  ctx: ToolExecutor
): Promise<string> {
  console.log(`Executing tool: ${toolName}`, input);

  try {
    switch (toolName) {
      // ── Web search ────────────────────────────────────────────────────────
      case "web_search": {
        const results = await webSearch(
          input.query,
          ctx.searchApiKey,
          input.num_results || 5
        );
        return formatSearchResults(results);
      }

      // ── Calculator ────────────────────────────────────────────────────────
      case "calculator": {
        try {
          // Safe eval using Function constructor (restricted scope)
          const expr = String(input.expression)
            .replace(/[^0-9+\-*/().%\s^]/g, "")
            .trim();
          // eslint-disable-next-line no-new-func
          const result = new Function(`"use strict"; return (${expr})`)();
          return `${input.expression} = ${result}`;
        } catch (e) {
          return `Error evaluating expression: ${e}`;
        }
      }

      // ── Device info ───────────────────────────────────────────────────────
      case "get_device_info": {
        const info: Record<string, string> = {};
        const type = input.info_type || "all";

        if (type === "time" || type === "all") {
          info.time = new Date().toLocaleTimeString();
          info.date = new Date().toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          });
          info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }

        if (type === "battery" || type === "all") {
          try {
            const level = await Battery.getBatteryLevelAsync();
            const state = await Battery.getBatteryStateAsync();
            info.battery = `${Math.round(level * 100)}%`;
            info.charging = state === Battery.BatteryState.CHARGING ? "Yes" : "No";
          } catch {
            info.battery = "unavailable";
          }
        }

        if (type === "network" || type === "all") {
          try {
            const netInfo = await Network.getNetworkStateAsync();
            info.network_connected = netInfo.isConnected ? "Yes" : "No";
            info.network_type = netInfo.type || "unknown";
          } catch {
            info.network = "unavailable";
          }
        }

        if (type === "storage" || type === "all") {
          try {
            const storageInfo = await FileSystem.getFreeDiskStorageAsync();
            info.free_storage = `${(storageInfo / 1e9).toFixed(1)} GB`;
          } catch {
            info.storage = "unavailable";
          }
        }

        return JSON.stringify(info, null, 2);
      }

      // ── Remember ──────────────────────────────────────────────────────────
      case "remember": {
        const id = await saveMemory({
          content: input.fact,
          category: input.category || "fact",
          importance: input.importance ?? 0.6,
        });
        return `Remembered: "${input.fact}" (id: ${id})`;
      }

      // ── Read file ─────────────────────────────────────────────────────────
      case "read_file": {
        try {
          const content = await FileSystem.readAsStringAsync(input.path, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          return content.slice(0, 8000); // Limit size
        } catch (e) {
          return `Error reading file: ${e}`;
        }
      }

      // ── List directory ────────────────────────────────────────────────────
      case "list_files": {
        try {
          const dir = input.path || FileSystem.documentDirectory;
          const files = await FileSystem.readDirectoryAsync(dir!);
          return files.join("\n");
        } catch (e) {
          return `Error listing directory: ${e}`;
        }
      }

      // ── Analyze image (pass-through — image already in context) ──────────
      case "analyze_image": {
        return `Image analysis task: "${input.task}". The image has been provided in the conversation context.`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Tool error (${toolName}): ${String(err)}`;
  }
}
