# MCP4Humans UI Design Reference

This document provides a detailed reference of the MCP4Humans Electron application's UI design and functionality. It serves as a guide for creating an equivalent VSCode extension with the same look, feel, and functionality.

## Table of Contents

- [MCP4Humans UI Design Reference](#mcp4humans-ui-design-reference)
  - [Table of Contents](#table-of-contents)
  - [Application Overview](#application-overview)
  - [Visual Design](#visual-design)
    - [Theme](#theme)
    - [Layout](#layout)
    - [Typography](#typography)
    - [Icons](#icons)
  - [Component Structure](#component-structure)
    - [Main Components](#main-components)
    - [Component Hierarchy](#component-hierarchy)
  - [Detailed Component Descriptions](#detailed-component-descriptions)
    - [ServerList](#serverlist)
    - [ServerCard](#servercard)
    - [Add Server Card](#add-server-card)
    - [ConfigForm](#configform)
    - [JsonInput](#jsoninput)
    - [ToolForm](#toolform)
    - [ToolParameter](#toolparameter)
  - [Interaction Patterns](#interaction-patterns)
    - [Server Management](#server-management)
    - [Server Connection](#server-connection)
    - [Tool Execution](#tool-execution)
  - [Visual Hierarchy and Nesting](#visual-hierarchy-and-nesting)
  - [Responsive Behavior](#responsive-behavior)
  - [Technical Implementation](#technical-implementation)
    - [Architecture](#architecture)
    - [Data Flow](#data-flow)
    - [Key Interfaces](#key-interfaces)
  - [VSCode Extension Considerations](#vscode-extension-considerations)
    - [Integration Points](#integration-points)
    - [Component Mapping](#component-mapping)
    - [Technical Differences](#technical-differences)
  - [Conclusion](#conclusion)

## Application Overview

MCP4Humans is a desktop application that allows users to:

1. Connect to MCP (Model Context Protocol) servers
2. Retrieve available tools from these servers
3. Generate standardized JSON schema representations
4. Test tools with custom parameters

## Visual Design

### Theme

The application uses a dark theme with the following key colors:

```typescript
// Dark theme
const theme = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9', // Light blue
    },
    secondary: {
      main: '#f48fb1', // Pink
    },
    background: {
      default: '#121212', // Very dark gray (almost black)
      paper: '#1e1e1e',   // Dark gray (for cards and surfaces)
    },
  },
  // Component-specific styling
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e1e1e', // Dark gray
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e1e1e', // Dark gray
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#272727', // Slightly lighter gray for app bar
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // No uppercase text transform on buttons
        },
      },
    },
  },
}
```

### Layout

- Minimum window width: 480px
- Responsive design that adapts to different screen sizes
- Vertical scrolling for content that exceeds the viewport
- No app bar in the current implementation (just content)

### Typography

- Font family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif
- Line height: 1.5
- Font weight: 400
- Text rendering: optimizeLegibility
- Font smoothing: antialiased

### Icons

- The application uses Material UI icons
- Common icons: AddIcon, EditIcon, DeleteIcon, SendIcon, ExpandMoreIcon, CheckCircleIcon, ErrorIcon
- Application icon: A custom SVG showing a human head profile with the MCP logo as the brain

## Component Structure

### Main Components

1. **App** - The root component that sets up the theme and layout
2. **ServerList** - The main container component that displays the list of servers
3. **ServerCard** - Individual server cards with expandable content
4. **ConfigForm** - Form for editing server configurations
5. **JsonInput** - Text area for pasting JSON configurations
6. **ToolForm** - Form for interacting with server tools
7. **ToolParameter** - Individual parameter inputs for tools

### Component Hierarchy

```text
App
└── ServerList
    ├── ServerCard (multiple)
    │   └── ToolForm (when expanded and connected)
    │       └── ToolParameter (for each parameter)
    └── Add Server Card
        └── ConfigForm (when expanded)
            └── JsonInput
```

## Detailed Component Descriptions

### ServerList

The main component that displays all configured servers and provides an "Add Server" card.

**Visual Characteristics:**

- Container with maximum width (md = medium in MUI)
- Minimum width of 480px
- Vertical list of server cards
- "Add Server" card at the bottom
- Loading spinner when fetching servers
- Error alert when server loading fails
- Empty state message when no servers are configured

**Functionality:**

- Loads the list of servers on mount
- Handles adding, editing, and deleting servers
- Manages server connections
- Displays snackbar notifications for operations

### ServerCard

Displays an individual server with its connection status and provides actions.

**Visual Characteristics:**

- Card with outlined variant
- Connection status indicator (red/yellow/green dot)
- Server name as title
- Server description as subtitle
- Transport type chip (STDIO or SSE)
- Edit and Delete action buttons
- Expandable content area for tools
- Visual hierarchy with nested cards using darker backgrounds

**States:**

- Disconnected (red indicator)
- Connecting (yellow indicator)
- Connected (green indicator)
- Expanded/Collapsed
- Edit mode

**Functionality:**

- Click to connect/expand
- Edit button to modify server configuration
- Delete button with confirmation dialog
- Displays tools when connected and expanded

### Add Server Card

A special card for adding new servers.

**Visual Characteristics:**

- Outlined card with "+" icon and "Add Server" text
- Fixed height (40px)
- Centered content
- Hover effect with shadow
- Expandable form below

**Functionality:**

- Click to expand/collapse the form
- Form has two sections:
  1. JSON input for pasting configurations
  2. Manual form fields for configuration

### ConfigForm

Form for creating or editing server configurations.

**Visual Characteristics:**

- Grouped fields with section headings
- Required field indicators
- Validation error messages
- Radio buttons for transport type selection
- Conditional fields based on transport type
- Tables for environment variables and headers

**Sections:**

1. Basic Information (name, description)
2. Transport Type (STDIO or SSE)
3. STDIO Configuration (when STDIO selected)
   - Command
   - Arguments
   - Working Directory
   - Environment Variables
4. SSE Configuration (when SSE selected)
   - URL
   - Headers

**Functionality:**

- Real-time validation
- Conditional rendering based on transport type
- Add/remove environment variables and headers

### JsonInput

Text area for pasting JSON configurations.

**Visual Characteristics:**

- Monospace font for better JSON readability
- Multi-line text area (10 rows)
- Error highlighting
- "Parse JSON" button aligned to the right

**Functionality:**

- Accepts JSON input
- Parses and validates JSON on button click
- Shows error messages for invalid JSON
- Updates the form fields when valid JSON is parsed

### ToolForm

Form for interacting with server tools.

**Visual Characteristics:**

- Card with tool name as chip
- Tool description
- Parameter inputs based on tool schema
- Send button with loading state
- Result display area
- Success/error indicators

**States:**

- Idle
- Executing (with spinner)
- Success (with result)
- Error (with message)

**Functionality:**

- Dynamically generates form based on tool schema
- Validates required parameters
- Executes tool with parameters
- Displays results or errors

### ToolParameter

Individual parameter input for a tool.

**Visual Characteristics:**

- Parameter name with required/optional indicator
- Parameter description
- Input type based on parameter type (text, number, boolean, enum)
- Validation state
- Slightly darker background for input fields

**Parameter Types:**

- String: Text field
- Number/Integer: Number field
- Boolean: Checkbox
- Enum: Select dropdown
- Object/Array: Text area (for JSON)

**Functionality:**

- Type-specific input handling
- Required field validation
- Updates parent form state on change

## Interaction Patterns

### Server Management

1. **Adding a Server:**
   - Click "Add Server" card
   - Either paste JSON configuration or fill form manually
   - Submit to add server
   - Server is validated by attempting to connect
   - On success, server is added to the list

2. **Editing a Server:**
   - Click Edit button on server card
   - Modify configuration in the form
   - Save changes
   - Server is validated by attempting to connect
   - On success, server is updated in the list

3. **Deleting a Server:**
   - Click Delete button on server card
   - Confirm deletion in dialog
   - Server is removed from the list

### Server Connection

1. **Connecting to a Server:**
   - Click on a server card
   - Connection status changes to "connecting" (yellow)
   - On success, status changes to "connected" (green)
   - Server card expands to show tools
   - On failure, status remains "disconnected" (red)

2. **Viewing Tools:**
   - When server is connected, tools are displayed in the expanded card
   - Each tool is shown as a card with name, description, and parameters

### Tool Execution

1. **Executing a Tool:**
   - Fill in required parameters
   - Click "Send" button
   - Button shows loading state
   - On completion, results are displayed
   - Success/error status is indicated

## Visual Hierarchy and Nesting

The application uses a visual hierarchy with nested components having progressively darker backgrounds:

1. **App Background:** #121212 (darkest)
2. **Server Card:** #1e1e1e
3. **Expanded Content:** rgba(0, 0, 0, 0.2) (slightly darker than server card)
4. **Tool Cards:** #1e1e1e
5. **Input Fields:** rgba(0, 0, 0, 0.2) (slightly darker than containing element)

This creates a clear visual distinction between different levels of the UI.

## Responsive Behavior

- Minimum width of 480px for the application
- Cards have minimum width to prevent content from being too compressed
- Text truncation with ellipsis for long content
- Flexible layouts that adapt to different screen sizes
- Scrollable containers for overflow content

## Technical Implementation

### Architecture

The MCP4Humans application follows a clear separation of concerns:

1. **Electron Main Process** (`electron/` directory)
   - `main.ts`: Application entry point and window management
   - `mcpClient.ts`: MCP client implementation using the MCP SDK
   - `ipc.ts`: IPC (Inter-Process Communication) setup
   - `schema.ts`: Server JSON schema definitions
   - `storage.ts`: Server configuration storage
   - `preload.ts`: Preload script for secure IPC

2. **React Renderer Process** (`src/` directory)
   - `api/`: Connects React to Electron IPC
   - `components/`: Reusable UI components
   - `models/`: TypeScript interfaces and types
   - `styles/`: CSS files
   - `App.tsx`: Main application component
   - `index.tsx`: React entry point

### Data Flow

1. **Server Configuration Storage**
   - Configurations are stored as JSON files in the user's app data directory
   - In-memory cache is maintained for quick access
   - CRUD operations are exposed via IPC

2. **MCP Client Communication**
   - Connections to MCP servers are managed in the main process
   - Active connections are stored in a map keyed by server name
   - Tool execution is handled through these connections

3. **UI State Management**
   - React component state for UI elements
   - No global state management (Redux, Context API) is used
   - Each component manages its own state

### Key Interfaces

```typescript
// Transport types
enum TransportType {
    STDIO = 'stdio',
    SSE = 'sse',
}

// STDIO configuration
interface StdioConfig {
    cmd: string
    args: string[]
    cwd?: string | null
    environment?: string[] | Record<string, string> | null
}

// SSE configuration
interface SSEConfig {
    url?: string | null
    headers?: Record<string, any>
}

// Server configuration
interface ServerConfig {
    name: string
    description?: string
    transportType: TransportType
    stdioConfig: StdioConfig
    sseConfig?: SSEConfig | null
}

// Tool definition
interface Tool {
    name: string
    description: string
    inputSchema: {
        type: string
        properties: Record<string, any>
        required?: string[]
    }
}

// Server schema (configuration + tools)
interface ServerSchema extends ServerConfig {
    filename: string
    tools: Tool[]
}

// API response wrapper
interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
}
```

## VSCode Extension Considerations

When implementing the VSCode extension version of MCP4Humans, consider the following:

### Integration Points

1. **VSCode Extension API**
   - Use VSCode's extension API instead of Electron
   - Leverage VSCode's UI components (webviews, panels, tree views)
   - Use VSCode's storage API for persistence

2. **UI Adaptation**
   - VSCode has its own theming system - adapt the MCP4Humans theme to match
   - Use VSCode's built-in icons where appropriate
   - Follow VSCode's UI patterns and guidelines

3. **State Management**
   - VSCode extensions have their own lifecycle
   - Consider using the Memento API for persistent storage
   - Handle extension activation/deactivation properly

### Component Mapping

| Electron App Component | VSCode Extension Equivalent             |
| ---------------------- | --------------------------------------- |
| Main Window            | VSCode Webview Panel                    |
| ServerList             | Custom View in Activity Bar or Explorer |
| ServerCard             | TreeItem with context menu              |
| ConfigForm             | Form in Webview                         |
| ToolForm               | Form in Webview                         |
| Storage                | VSCode Extension Context Storage        |

### Technical Differences

1. **Communication**
   - Instead of Electron IPC, use VSCode's message passing between extension and webviews
   - Use VSCode commands for actions

2. **Process Management**
   - VSCode handles process spawning differently than Electron
   - Use VSCode's API for running external processes

3. **UI Framework**
   - Consider using VSCode's Webview API with React
   - Adapt Material-UI components to match VSCode's styling

4. **Persistence**
   - Use VSCode's extension storage instead of file-based storage
   - Consider using workspace settings for configuration

## Conclusion

This document provides a comprehensive reference for the MCP4Humans UI design and implementation. When creating the VSCode extension version, it's important to maintain the same visual design, component structure, and interaction patterns while adapting to VSCode's extension architecture and UI guidelines.

The goal is to create a seamless experience where users familiar with the Electron version can easily transition to the VSCode extension without a significant learning curve, while also ensuring the extension feels native to the VSCode environment.
