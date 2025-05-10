# Change Log

All notable changes to the "MCP4Humans" extension will be documented in this file.

## [1.0.7] - 2024-05-09

### Added

- New server view
- Replaced images

### Fixed

- Allow changing server name in edit settings
- Avoid overwriting servers with duplicated names

## [1.0.6] - 2024-05-08

### Added

- Support for StreamableHTTP. Backwards compatible with SSE

### Fixed

- Resending tool commands wasn't refreshing the result

## [1.0.5] - 2024-05-08

### Added

- Downgraded VSCode version compatibility to 1.96.2 to support latest Cursor

## [1.0.4] - 2024-05-08

### Added

- Server settings view converted into tab view to separate settings and tools
- Added Log tab with main events and raw messages for debugging MCP servers

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
