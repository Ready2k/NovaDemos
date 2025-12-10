# Prompt Naming Convention

This directory contains all LLM prompts used by the system. Prompts are organized using a prefix-based naming convention for better organization and filtering in the GUI.

## Naming Convention

### Core Platform Prompts (`core-`)
These are system-level prompts that handle core functionality:
- `core-system_default.txt` - Default system prompt
- `core-helpful_assistant.txt` - Standard helpful assistant prompt
- `core-guardrails.txt` - Core safety and behavior guardrails
- `core-native_tool_instructions.txt` - Instructions for native tool usage
- `core-native_tool_assistant.txt` - Assistant with native tool capabilities
- `core-simple_assistant.txt` - Basic assistant functionality
- `core-tool_access_assistant.txt` - Assistant with tool access
- `core-tool_usage_assistant.txt` - Assistant with tool usage instructions
- `core-web_search_time.txt` - Web search time query prompt
- `core-sonic_agent.txt` - Sonic agent core functionality
- `core-agent_echo.txt` - Agent echo functionality

### Persona Prompts (`persona-`)
These are character-based prompts that define specific personalities or roles:
- `persona-pirate.txt` - Pirate character
- `persona-french_tutor.txt` - French language tutor
- `persona-my_french_tutor.txt` - Personal French tutor variant
- `persona-banking_bot.txt` - Banking customer service bot
- `persona-concise_coder.txt` - Concise coding assistant
- `persona-sci_fi_bot.txt` - Science fiction themed bot

## GUI Filtering

The frontend automatically filters prompts based on these prefixes:
- **Persona Selector**: Only shows `persona-` prefixed prompts
- **Prompt Dropdown**: Shows all prompts organized in categories (Core Platform, Personas, Other)

## Adding New Prompts

When adding new prompts, follow the naming convention:
- Use `core-` prefix for system/platform functionality
- Use `persona-` prefix for character/role-based prompts
- Use descriptive names with underscores for spaces
- Always use `.txt` extension

Example: `persona-helpful_doctor.txt` or `core-error_handler.txt`