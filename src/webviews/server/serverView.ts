/**
 * Server Detail Webview
 *
 * This module provides a webview panel for displaying server details and tools.
 */
import * as vscode from 'vscode'
import { ServerSchema, ServerConfig, Tool, ToolParameterType } from '../../models/types'
import { mcpCallTool } from '../../services/mcpClient'
import { getWebviewContent } from '../../utils/webviewUtils'
import { LogService } from '../../services/logService'
import {
    vscLogServerAdd,
    vscMCPConnect,
    vscMCPDisconnect,
    vscServerViewEdit,
    vscStorageDeleteServer,
} from '../../models/commands'

/**
 * Tab types for the server detail view
 */
enum TabType {
    SETTINGS = 'settings',
    TOOLS = 'tools',
    LOG = 'log',
}

/**
 * Class that manages the server detail webview panel
 */
export class ServerDetailWebview {
    /**
     * Keeps track of server panels
     * Allows one panel per server
     */
    public static panels: ServerDetailWebview[] = []

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []
    private _schema: ServerSchema
    private _isConnected: boolean = false
    private _isLoading: boolean = false
    private _activeTab: TabType = TabType.SETTINGS

    /**
     * Get the static view type for the webview panel
     */
    public static readonly viewType = 'mcp4humans.serverDetail'

    /**
     * Get the server panel
     */
    public static getPanel(name: string): ServerDetailWebview | undefined {
        return ServerDetailWebview.panels.find(panel => panel._schema.name === name)
    }

    /**
     * Create or show a server detail panel
     * @param extensionUri The URI of the extension
     * @param server The server schema
     * @param isConnected Whether the server is connected
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        schema: ServerSchema,
        isConnected: boolean
    ): ServerDetailWebview {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        // Check if there's already a panel for this server
        const serverPanel = ServerDetailWebview.getPanel(schema.name)
        if (serverPanel) {
            serverPanel._schema = schema
            serverPanel._isConnected = isConnected
            serverPanel._panel.reveal(column)
            serverPanel._update()
            return serverPanel
        }

        // Create a new panel and add it to the list
        const panel = vscode.window.createWebviewPanel(
            ServerDetailWebview.viewType,
            `Server: ${schema.name}`,
            column || vscode.ViewColumn.One,
            {
                // Enable JavaScript in the webview
                enableScripts: true,
                // Restrict the webview to only load resources from the extension's directory
                localResourceRoots: [extensionUri],
                // Retain context when hidden
                retainContextWhenHidden: true,
            }
        )

        const view = new ServerDetailWebview(panel, extensionUri, schema, isConnected)
        ServerDetailWebview.panels.push(view)

        return view
    }

    /**
     * Constructor
     * @param panel The webview panel
     * @param extensionUri The URI of the extension
     * @param schema The server schema
     * @param isConnected Whether the server is connected
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        schema: ServerSchema,
        isConnected: boolean
    ) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._schema = schema
        this._isConnected = isConnected

        // Select initial tab based on connection status
        if (isConnected) {
            this._activeTab = TabType.TOOLS
        } else {
            this._activeTab = TabType.SETTINGS
        }

        // Set the webview's initial html content
        this._update()

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    this._update()
                }
            },
            null,
            this._disposables
        )

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'connect':
                        vscMCPConnect(this._schema as ServerConfig)
                        return
                    case 'disconnect':
                        vscMCPDisconnect(this._schema as ServerConfig)
                        return
                    case 'serverEdit':
                        vscServerViewEdit(this._schema)
                        return
                    case 'deleteServer':
                        vscStorageDeleteServer(this._schema.name)
                        this._panel.dispose()
                        return
                    case 'callMCPTool':
                        this._handleExecuteTool(message.toolName, message.params)
                        return
                    case 'tabChanged':
                        this._handleTabChange(message.tab as TabType)
                        return
                    case 'clearLogs':
                        LogService.getInstance().clearLogs(this._schema.name)
                        this._update()
                        return
                }
            },
            null,
            this._disposables
        )
    }

    /**
     * Update the server and connection status
     * @param schema The server schema
     * @param isConnected Whether the server is connected
     */
    public async update(schema: ServerSchema, isConnected: boolean): Promise<void> {
        this._schema = schema
        this._isConnected = isConnected
        this._panel.title = `Server: ${schema.name}`
        this._update()
    }

    /**
     * Handle tab change event from the webview
     * @param tabId The ID of the tab to switch to
     */
    private _handleTabChange(tabId: TabType): void {
        this._activeTab = tabId
        // Update the UI to ensure the correct tab content is shown
        this._update()
    }

    /**
     * Dispose of the webview panel and resources
     */
    public dispose(): void {
        // Remove panel from list
        ServerDetailWebview.panels = ServerDetailWebview.panels.filter(panel => panel !== this)

        // Clean up resources
        this._panel.dispose()

        while (this._disposables.length) {
            const disposable = this._disposables.pop()
            if (disposable) {
                disposable.dispose()
            }
        }
    }

    /**
     * Handle the execute tool button click
     * @param toolName The name of the tool to execute
     * @param params The parameters for the tool
     */
    private async _handleExecuteTool(toolName: string, params: any): Promise<void> {
        // Find the tool by name
        const tool = this._schema.tools.find(t => t.name === toolName)
        if (!tool) {
            vscode.window.showErrorMessage(`Tool ${toolName} not found`)
            return
        }

        try {
            const start = Date.now()
            // Execute the tool
            const response = await mcpCallTool(this._schema.name, toolName, params)

            if (!response.success) {
                // Error case - tool execution failed
                this._panel.webview.postMessage({
                    command: 'toolResult',
                    toolName: toolName,
                    resultType: 'error',
                    data: response.error,
                })
                return
            }

            // Ensure it takes at least 200ms to avoid the UI to glitch fast
            const end = Date.now()
            if (end - start < 200) {
                await new Promise(resolve => setTimeout(resolve, 200 - (end - start)))
            }

            // Process the successful response
            const data = response.data

            // Check if the response has the MCP content format
            if (data && data.content && Array.isArray(data.content) && data.content.length > 0) {
                const content = data.content[0]

                // Check if the response contains an error flag
                const isError = data.isError === true

                // Handle different content types
                if (content.type === 'image' && content.data && content.mimeType) {
                    // Image content
                    this._panel.webview.postMessage({
                        command: 'toolResult',
                        toolName: toolName,
                        resultType: isError ? 'failed' : 'success',
                        contentType: 'image',
                        mimeType: content.mimeType,
                        data: content.data,
                    })
                } else if (content.type === 'text' && content.text !== undefined) {
                    // Text content - try to parse as JSON if possible
                    try {
                        const jsonData = JSON.parse(content.text)

                        let failed = isError

                        // Check if json contains status=error
                        if ('status' in jsonData) {
                            const status = String(jsonData.status).toLowerCase()

                            if (status === 'error') {
                                failed = true
                            }
                        }

                        this._panel.webview.postMessage({
                            command: 'toolResult',
                            toolName: toolName,
                            resultType: failed ? 'failed' : 'success',
                            contentType: 'json',
                            data: jsonData,
                        })
                    } catch (e) {
                        // Not valid JSON, send as text
                        // Check if text starts with "error"
                        let failed = isError
                        if (content.text.toLowerCase().startsWith('error')) {
                            failed = true
                        }

                        this._panel.webview.postMessage({
                            command: 'toolResult',
                            toolName: toolName,
                            resultType: failed ? 'failed' : 'success',
                            contentType: 'text',
                            data: content.text,
                        })
                    }
                } else {
                    // Unknown or unhandled content type, send the raw data
                    this._panel.webview.postMessage({
                        command: 'toolResult',
                        toolName: toolName,
                        resultType: isError ? 'failed' : 'success',
                        contentType: 'raw',
                        data: data,
                    })
                }
            } else {
                // Regular response format (not MCP content format)
                console.log('Regular response format:', JSON.stringify(data))

                // Check if the response has a status field with value "error"
                let resultType = 'success'
                if (data && typeof data === 'object' && 'status' in data) {
                    console.log('Status field found in regular response:', data.status)
                    if (String(data.status).toLowerCase() === 'error') {
                        console.log('Setting resultType to failed due to status=error')
                        resultType = 'failed'
                    }
                }

                this._panel.webview.postMessage({
                    command: 'toolResult',
                    toolName: toolName,
                    resultType: resultType,
                    contentType: 'raw',
                    data: data,
                })
            }
        } catch (error) {
            // Handle errors
            this._panel.webview.postMessage({
                command: 'toolResult',
                toolName: toolName,
                resultType: 'error',
                contentType: 'text',
                data: error instanceof Error ? error.message : String(error),
            })
        }
    }

    /**
     * Update the webview content
     */
    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview()
    }

    /**
     * Get the HTML for the webview
     * @returns The HTML for the webview
     */
    private _getHtmlForWebview(): string {
        // Get the connection status
        const connectionStatus = this._isConnected ? 'Connected' : 'Disconnected'
        const connectionStatusClass = this._isConnected ? 'connected' : 'disconnected'
        const connectionButton = this._isConnected
            ? `<button class="disconnect-button">Disconnect</button>`
            : `<button class="connect-button">Connect</button>`

        // Get the server configuration details
        const serverDetails = this._getServerConfigHtml()

        // Get the tools section
        const toolsSection = this._getToolsSectionHtml()

        // Get the log section
        const logSection = this._getLogSectionHtml()

        // Determine which tab should be active
        const settingsTabActive = this._activeTab === TabType.SETTINGS ? 'active' : ''
        const toolsTabActive = this._activeTab === TabType.TOOLS ? 'active' : ''
        const logTabActive = this._activeTab === TabType.LOG ? 'active' : ''

        // Prepare replacements for the template
        const replacements: Record<string, string> = {
            serverName: this._schema.name,
            serverDescription: this._schema.description || '',
            connectionStatus: connectionStatus,
            connectionStatusClass: connectionStatusClass,
            connectionButton: connectionButton,
            serverDetails: serverDetails,
            toolsSection: toolsSection,
            logSection: logSection,
            settingsTabActive: settingsTabActive,
            toolsTabActive: toolsTabActive,
            logTabActive: logTabActive,
            initialActiveTab: this._activeTab,
        }

        // Get the HTML content using the template
        return getWebviewContent(
            this._panel.webview,
            this._extensionUri,
            'dist/webviews/html/serverView.html',
            replacements
        )
    }

    /**
     * Get the HTML for the server configuration section
     * @returns The HTML for the server configuration section
     */
    private _getServerConfigHtml(): string {
        // Get the transport-specific configuration rows
        let transportRows = ''
        if (this._schema.transportType === 'stdio') {
            const stdioConfig = this._schema.stdioConfig
            if (stdioConfig) {
                transportRows = `
                    <tr>
                        <td class="property-name">Command</td>
                        <td>${stdioConfig.cmd}</td>
                    </tr>
                    <tr>
                        <td class="property-name">Arguments</td>
                        <td>${stdioConfig.args.join(' ')}</td>
                    </tr>
                    ${
                        stdioConfig.cwd
                            ? `
                    <tr>
                        <td class="property-name">Working Directory</td>
                        <td>${stdioConfig.cwd}</td>
                    </tr>
                    `
                            : ''
                    }
                    ${
                        stdioConfig.environment && Object.keys(stdioConfig.environment).length > 0
                            ? `
                    <tr>
                        <td class="property-name">Environment Variables</td>
                        <td>
                            <table class="nested-table">
                                ${Object.entries(stdioConfig.environment)
                                    .map(
                                        ([key, value]) => `
                                <tr>
                                    <td>${key}=${value}</td>
                                </tr>`
                                    )
                                    .join('')}
                            </table>
                        </td>
                    </tr>
                    `
                            : ''
                    }
                `
            }
        } else if (this._schema.transportType === 'http') {
            const httpConfig = this._schema.httpConfig
            if (httpConfig) {
                transportRows = `
                    <tr>
                        <td class="property-name">URL</td>
                        <td>${httpConfig.url}</td>
                    </tr>
                    ${
                        httpConfig.headers && Object.keys(httpConfig.headers).length > 0
                            ? `
                    <tr>
                        <td class="property-name">Headers</td>
                        <td>
                            <table class="nested-table">
                                ${Object.entries(httpConfig.headers)
                                    .map(
                                        ([key, value]) => `
                                <tr>
                                    <td>${key}: ${value}</td>
                                </tr>`
                                    )
                                    .join('')}
                            </table>
                        </td>
                    </tr>
                    `
                            : ''
                    }
                `
            }
        }

        // Return the server configuration section with separate sections
        return `
            <div class="section">
                <!-- Server Configuration Section -->
                <div class="settings-section">
                    <div class="section-header">
                        <h2 class="section-title">Server Configuration</h2>
                        <button id="edit-server-btn" class="action-button" ${this._isConnected ? 'disabled' : ''} title="${this._isConnected ? 'Disconnect server to edit' : 'Edit server configuration'}">Edit</button>
                    </div>

                    <table class="settings-table">
                        <tr>
                            <td class="property-name">Transport Type</td>
                            <td>${this._schema.transportType}</td>
                        </tr>
                        ${transportRows}
                    </table>
                </div>
            </div>
            <div class="section">
                <!-- Danger Zone Section -->
                <div class="settings-section danger-section">
                    <h2 class="section-title">Danger Zone</h2>
                    <div class="settings-actions">
                        <button id="delete-server-btn" class="delete-button action-button">Delete Server</button>
                    </div>
                </div>
            </div>
        `
    }

    /**
     * Generate HTML for parameter inputs
     * @param tool The tool to generate parameter inputs for
     * @returns HTML for parameter inputs
     */
    private _generateParameterInputs(tool: Tool): string {
        if (!tool.parameters || tool.parameters.length === 0) {
            return '<p>This tool has no parameters.</p>'
        }

        const paramInputs = tool.parameters.map(param => {
            const required = param.required ? '<span class="required-indicator">*</span>' : ''

            let input = ''

            switch (param.type) {
                case ToolParameterType.STRING:
                    // Regular string - use a text input
                    input = `<input type="text" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" value="${param.default || ''}" />`
                    break
                case ToolParameterType.NUMBER:
                    input = `<input type="number" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" value="${param.default || ''}" />`
                    break
                case ToolParameterType.BOOLEAN:
                    input = `
                        <select id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}">
                            <option value="true" ${param.default === true ? 'selected' : ''}>true</option>
                            <option value="false" ${param.default === false ? 'selected' : ''}>false</option>
                        </select>
                    `
                    break
                case ToolParameterType.OBJECT:
                    input = `<textarea id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" rows="5" placeholder="{}">${param.default || ''}</textarea>`
                    break
                case ToolParameterType.ARRAY:
                    input = `<input type="text" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" placeholder='["item1", "item2"]' value="${param.default ? JSON.stringify(param.default) : ''}" />`
                    break
                default:
                    input = `<input type="text" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" />`
            }

            return `
                <div class="parameter-group">
                    <label for="${tool.name}-${param.name}" class="parameter-label">${param.name}${required}</label>
                    ${param.description ? `<div class="parameter-description">${param.description}</div>` : ''}
                    ${input}
                    <div class="parameter-error" data-error-for="${param.name}"></div>
                </div>
            `
        })

        return paramInputs.join('')
    }

    /**
     * Get the HTML for the log section
     * @returns The HTML for the log section
     */
    private _getLogSectionHtml(): string {
        // Get logs for this server
        const logs = LogService.getInstance().getLogs(this._schema.name)

        if (logs.length === 0) {
            return `
                <div class="section">
                    <h2 class="section-title">Log</h2>
                    <p class="tab-empty-message">No logs available for this server.</p>
                </div>
            `
        }

        // Generate HTML for each log entry
        const logEntriesHtml = logs
            .map((log, index) => {
                const timestamp = log.timestamp.toLocaleString()
                const statusClass = log.isError ? 'error' : 'success'
                const icon = log.isError ? '❌' : '✓'
                const hasRawData = !!log.rawData
                const expandableClass = hasRawData ? 'expandable' : ''
                const rawDataHtml = hasRawData
                    ? `<div class="log-raw-data hidden"><pre>${this._escapeHtml(log.rawData || '')}</pre></div>`
                    : ''

                return `
                <div class="log-entry ${statusClass} ${expandableClass}" data-index="${index}">
                    <div class="log-entry-header">
                        <span class="log-entry-icon">${icon}</span>
                        <span class="log-entry-message">${this._escapeHtml(log.message)}</span>
                        <span class="log-entry-timestamp">${timestamp}</span>
                        ${hasRawData ? '<span class="log-entry-toggle">▼</span>' : ''}
                    </div>
                    ${rawDataHtml}
                </div>
            `
            })
            .join('')

        return `
            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">Log</h2>
                    <button id="clear-logs-btn" class="action-button">Clear Logs</button>
                </div>
                <div class="log-entries">
                    ${logEntriesHtml}
                </div>
            </div>
        `
    }

    /**
     * Escape HTML special characters
     * @param text Text to escape
     * @returns Escaped text
     */
    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
    }

    /**
     * Get the HTML for the tools section
     * @returns The HTML for the tools section
     */
    private _getToolsSectionHtml(): string {
        // If the server is not connected, show a message
        if (!this._isConnected) {
            return `
                <div class="section">
                    <p class="tab-empty-message">Please connect to the server to access tools.</p>
                </div>
            `
        }

        // If the tools are loading, show a spinner
        if (this._isLoading) {
            return `
                <div class="section">
                    <div class="loading">
                        <div class="spinner"></div>
                    </div>
                </div>
            `
        }

        // If there are no tools, show a message
        if (!this._schema.tools || this._schema.tools.length === 0) {
            return `
                <div class="section">
                    <p>No tools available for this server.</p>
                </div>
            `
        }

        // Generate HTML for each tool
        const toolsHtml = this._schema.tools
            .map(tool => {
                // Generate parameter inputs
                const parameterInputs = this._generateParameterInputs(tool)

                return `
                <div class="tool-card" id="tool-${tool.name}">
                    <div class="tool-header">
                        <span class="tool-name-chip">${tool.name}</span>
                    </div>
                    <p class="tool-description">${tool.description}</p>

                    <form class="tool-form" data-tool-name="${tool.name}">
                        ${parameterInputs}

                        <button type="submit" class="send-button">
                            <span class="loading-spinner hidden"></span>
                            <span class="button-text">Send</span>
                        </button>
                    </form>

                    <div class="result-container hidden">
                        <div class="result-header">
                            <div class="result-status">
                                <span class="result-status-text"></span>
                            </div>
                            <span class="result-toggle">▼</span>
                        </div>
                        <div class="result-content">
                            <pre class="result-text"></pre>
                        </div>
                    </div>
                </div>
            `
            })
            .join('')

        // Return the tools section
        return `
            <div class="section">
                ${toolsHtml}
            </div>
        `
    }
}
