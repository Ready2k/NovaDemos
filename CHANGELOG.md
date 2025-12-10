# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Dynamic AWS Configuration GUI**: Added Agent Core Runtime ARN field to AWS Configuration panel
  - New input field for Agent Core Runtime ARN in the AWS Configuration modal
  - Session-based credential storage using sessionStorage for security
  - Credentials are now set before connecting, not after
  - Visual indicators show when credentials are stored ("Stored (enter new to update)" placeholders)
  - "Clear Stored" button to remove all stored credentials
  - Automatic credential sending on WebSocket connection
  - Support for per-session Agent Core Runtime ARN override

### Changed
- **Improved AWS Credential Flow**: Credentials are now stored locally and sent automatically on connection
- **Enhanced Security**: Sensitive credentials are not displayed after saving, only non-sensitive fields (Region, ARN) are shown
- **Better UX**: Clear visual feedback when credentials are saved vs when they need to be configured

### Technical Details
- Updated `SonicConfig` interface to include `agentCoreRuntimeArn` field
- Modified `updateCredentials()` method to accept and store Agent Core Runtime ARN
- Enhanced `callAgentCore()` function to use session-specific ARN when available
- Added credential persistence using browser sessionStorage
- Improved error handling and user feedback

## Previous Versions

### Features Already Implemented
- Real-time voice-to-voice interaction with Amazon Nova 2 Sonic
- Dual architecture support (Nova Sonic Direct + Bedrock Agent modes)
- Native tool integration with progressive filler system
- Smart tool result caching with TTL
- Multiple interaction modes (Chat + Voice, Voice Only, Chat Only)
- Persona presets and voice selection
- Session statistics and audio visualization
- Toast notification system
- Tool enable/disable controls