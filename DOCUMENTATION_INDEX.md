# Voice S2S Documentation Index

## 📚 Quick Links

- **[README.md](README.md)** - Main project overview and setup
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and updates

## 📖 Documentation Structure

### `/docs/guides/` - User Guides
- **[QUICK_START.md](docs/guides/QUICK_START.md)** - Get started quickly
- **[QUICKSTART_S2S.md](docs/guides/QUICKSTART_S2S.md)** - Speech-to-speech setup
- **[QUICK_REFERENCE.md](docs/guides/QUICK_REFERENCE.md)** - Quick reference guide
- **[LOCAL_VS_DOCKER.md](docs/guides/LOCAL_VS_DOCKER.md)** - Deployment options

### `/docs/fixes/` - Recent Fixes (Jan 2026)
- **[INTENT_PRESERVATION_FIX_APPLIED.md](docs/fixes/INTENT_PRESERVATION_FIX_APPLIED.md)** - Intent preservation through IDV
- **[INTENT_STACK_FIX_COMPLETE.md](docs/fixes/INTENT_STACK_FIX_COMPLETE.md)** - Intent clearing after task completion
- **[TOOLS_UI_FIX_COMPLETE.md](docs/fixes/TOOLS_UI_FIX_COMPLETE.md)** - Tools display and naming

### `/docs/status/` - Status Reports
- **[LIVE_SESSION_DATA_VERIFICATION_COMPLETE.md](docs/status/LIVE_SESSION_DATA_VERIFICATION_COMPLETE.md)** - Session data interface fix
- Other status and completion reports

### `/docs/archive/` - Historical Documentation
- Workflow diagrams and state models
- Implementation notes and integration docs
- Test documentation and troubleshooting guides
- Old fix documentation and status reports

## 🏗️ Project Structure

```
Voice_S2S/
├── README.md                    # Main documentation
├── CHANGELOG.md                 # Version history
├── DOCUMENTATION_INDEX.md       # This file
│
├── docs/                        # Documentation
│   ├── guides/                  # User guides
│   ├── fixes/                   # Recent fixes
│   ├── status/                  # Status reports
│   └── archive/                 # Historical docs
│
├── frontend-v2/                 # Next.js frontend
├── backend/                     # Express.js backend
├── gateway/                     # WebSocket gateway
├── agents/                      # Multi-agent runtime
├── local-tools/                 # Local tool execution
│
├── workflows/                   # Workflow definitions
├── tools/                       # Tool definitions (JSON)
└── chat_history/                # Session history
```

## 🔧 Key Features

### Voice & Audio
- Real-time speech-to-speech with Nova 2 Sonic
- Multiple voices (Matthew, Tiffany, Amy, etc.)
- Audio visualization
- Interruption handling

### Intelligence
- Native tool calling
- Knowledge base RAG
- Multi-step workflows
- Sentiment analysis

### Enterprise
- Langfuse observability
- AWS Bedrock integration
- Custom tool creation
- Persona management

## 🚀 Getting Started

1. **Setup**: Follow [README.md](README.md) for installation
2. **Quick Start**: See [QUICK_START.md](docs/guides/QUICK_START.md)
3. **Configuration**: Check [LOCAL_VS_DOCKER.md](docs/guides/LOCAL_VS_DOCKER.md)

## 📝 Recent Updates (January 2026)

### Live Session Data Fix
- Fixed session duration, language detection, cost tracking, and token counts
- All Live Session Data fields now update correctly
- See: [LIVE_SESSION_DATA_VERIFICATION_COMPLETE.md](docs/status/LIVE_SESSION_DATA_VERIFICATION_COMPLETE.md)

### Intent Preservation Fix
- User intent now preserved through IDV and verification flows
- Intent cleared after task completion
- Triage can set new intents for sequential tasks
- See: [INTENT_PRESERVATION_FIX_APPLIED.md](docs/fixes/INTENT_PRESERVATION_FIX_APPLIED.md)
- See: [INTENT_STACK_FIX_COMPLETE.md](docs/fixes/INTENT_STACK_FIX_COMPLETE.md)

### Tools UI Fix
- Clean display names for all tools
- Handoff tools now visible in UI
- Correct checkbox matching with persona config
- See: [TOOLS_UI_FIX_COMPLETE.md](docs/fixes/TOOLS_UI_FIX_COMPLETE.md)

## 🐛 Troubleshooting

Check `/docs/archive/` for historical troubleshooting guides and debug documentation.

## 📞 Support

For issues or questions, refer to the documentation in `/docs/` or check the archived documentation in `/docs/archive/`.

---

**Last Updated**: January 30, 2026
**Version**: See [CHANGELOG.md](CHANGELOG.md)
