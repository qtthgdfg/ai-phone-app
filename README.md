# AI Assistant — Android App

A production Android AI app powered by Claude, with camera, web search,
long-term memory, LoRA fine-tuning, and automatic APK builds via GitHub Actions.

---

## Features

| Feature | Details |
|---------|---------|
| **Claude AI** | Streams responses from Claude Opus/Sonnet/Haiku |
| **Vision / Camera** | Capture or upload images → AI analysis (OCR, describe, solve, translate…) |
| **Web Search** | Real-time Brave Search integrated as a Claude tool |
| **Long-term Memory** | SQLite on-device memory — AI remembers facts about you across sessions |
| **Tool Use** | Web search, calculator, device info, file reader, auto-remember |
| **Extended Thinking** | Claude's reasoning mode for complex problems |
| **File Upload** | Attach documents, code files, PDFs to any message |
| **User Style** | Tone, length, code style — AI adapts to your preferences |
| **Fine-tuning** | Export your conversations → LoRA fine-tune an open model |
| **Auto APK build** | GitHub Actions builds and signs APK on every push |

---

## Quick Start

### Prerequisites
- Node.js 18+
- Android Studio (for local builds) OR just push to GitHub for auto-build

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/ai-phone-app.git
cd ai-phone-app
npm install
```

### 2. Get API keys
- **Claude API key** (required): https://console.anthropic.com → API Keys
- **Brave Search API key** (optional, free): https://api.search.brave.com

### 3. Run on phone (USB debugging)
```bash
# Connect phone via USB with USB debugging enabled
npx expo run:android
```

### 4. Build APK locally
```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# APK at: android/app/build/outputs/apk/release/app-release.apk
```

---

## GitHub Actions Auto-Build (Recommended)

Push your code to GitHub and get an APK automatically:

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ai-phone-app.git
git push -u origin main
```

### Step 2 — Create signing keystore (one-time)
```bash
keytool -genkey -v \
  -keystore my-release-key.keystore \
  -alias my-key-alias \
  -keyalg RSA -keysize 2048 -validity 10000
```

### Step 3 — Add GitHub Secrets
Go to your repo → **Settings → Secrets and variables → Actions → New secret**

| Secret name | Value |
|-------------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i my-release-key.keystore \| tr -d '\n'` |
| `ANDROID_KEY_ALIAS` | `my-key-alias` |
| `ANDROID_KEY_PASSWORD` | your key password |
| `ANDROID_STORE_PASSWORD` | your keystore password |

### Step 4 — Download APK
After the Actions workflow completes (~15 min):
1. Go to **Actions** tab in your GitHub repo
2. Click the latest workflow run
3. Download **AI-Assistant-APK** from Artifacts

### Install on phone
Transfer the `.apk` file to your phone and tap to install.
(Enable "Install from unknown sources" in Android settings)

---

## Fine-tuning Your Own Model

The app automatically collects high-rated conversation examples in SQLite.

### Export data from app
Settings screen → **Export Fine-tune Data** → save as `fine_tune/chat_finetune.jsonl`

### Run LoRA fine-tuning (needs GPU, ~8GB VRAM)
```bash
pip install -r fine_tune/requirements.txt

python fine_tune/train_lora.py \
  --data fine_tune/chat_finetune.jsonl \
  --model mistralai/Mistral-7B-Instruct-v0.3 \
  --max_steps 500 \
  --output_dir fine_tune/output
```

### Use your fine-tuned model
```bash
# Run locally with Ollama
ollama create my-ai -f fine_tune/Modelfile

# Or deploy as API and point the app to it in Settings
```

---

## File Structure

```
ai-phone-app/
├── App.tsx                         # Navigation + root
├── src/
│   ├── screens/
│   │   ├── ChatScreen.tsx          # Main chat UI with streaming
│   │   ├── CameraScreen.tsx        # Camera capture + AI analysis
│   │   └── SettingsScreen.tsx      # API keys, model, style, memory
│   ├── services/
│   │   ├── claude.ts               # Claude API: chat, vision, tools, streaming
│   │   ├── search.ts               # Brave Search + DuckDuckGo fallback
│   │   ├── memory.ts               # SQLite memory, conversations, stats
│   │   └── tools.ts                # Tool execution: search, calc, device info
│   └── types/index.ts              # TypeScript types
├── fine_tune/
│   ├── train_lora.py               # LoRA fine-tuning script
│   └── requirements.txt
├── .github/workflows/
│   └── build-apk.yml               # GitHub Actions APK builder
├── app.json                        # Expo config + Android permissions
└── package.json
```

---

## On-Device RAM / CPU

The app is optimized to make efficient use of your phone's resources:

- **SQLite WAL mode** — faster concurrent reads/writes for memory
- **Streaming responses** — lower peak memory than buffering full responses
- **Image compression** — images compressed to 80% quality before API call
- **Context window management** — old messages trimmed to stay within limits
- **Lazy loading** — conversations loaded on demand, not all at once

For **on-device AI inference** (running a model directly on your phone):
- See the `fine_tune/` folder for exporting a model
- Use [MLC LLM](https://github.com/mlc-ai/mlc-llm) or [llama.cpp Android](https://github.com/ggerganov/llama.cpp) to run it locally
- 7B models run at ~5 tokens/sec on a flagship Android phone

---

## Troubleshooting

**"API key required" on first launch**
→ Go to Settings tab and add your Claude API key

**Build fails in GitHub Actions**
→ Check that all 4 secrets are set correctly; run the workflow manually from the Actions tab

**Camera not working**
→ Check Android permissions: Settings → Apps → AI Assistant → Permissions → Camera

**Web search returns no results**
→ Add a Brave Search API key in Settings (the DuckDuckGo fallback has limited results)

**App crashes on startup**
→ Check the Metro bundler output: `npx expo start` and look for import errors
