# Change Log

All notable changes to the "MCP4Humans" extension will be documented in this file.

## [1.0.4] - 2024-05-08

### Added

- Server settings view converted into tab view to separate settings and tools

## [1.0.3] - 2024-05-08

### Added

- Now supports multiple server views in parallel

## [1.0.2] - 2024-05-07

### Added

- Enhanced tool response handling with support for different content types
- Added support for displaying images in tool responses
- Added a new "Failed" state for tools that return errors in their response

### Fixed

- Fixed bug where tools weren't reloaded when switching between servers in an already open panel
- Improved JSON response handling to extract and display the actual content

## [1.0.1] - 2024-05-07

### Fixed

- Fixed missing template files in the published extension
- Replaced "Show more" button with scrollable result box

## [1.0.0] - 2024-05-07

### Added

- Initial release of MCP4Humans
- Server management interface for adding, editing, and deleting MCP servers
- Support for both stdio and SSE MCP servers
- Tool execution with parameter forms
- Result display with collapsible panels
- Persistent storage of server configurations
- Connection status indicators
- Special handling for uv and python commands
