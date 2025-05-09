/**
 * Server Detail Webview
 *
 * This module provides a webview panel for displaying server details and tools.
 */
import * as vscode from 'vscode'
import {
    ServerSchema,
    ServerConfig,
    Tool,
    ToolParameterType,
    TransportType,
} from '../../models/types'
import { mcpCallTool } from '../../services/mcpClient'
import { getWebviewContent, getNonce } from '../../utils/webviewUtils'
import { LogService } from '../../services/logService'
import {
    MCPConnectType,
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
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist'),
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webviews', 'css'),
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webviews', 'js'),
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webviews', 'html'),
                ],
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
                        vscMCPConnect(this._schema as ServerConfig, MCPConnectType.EXISTING)
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
        // If connected, switch to tools tab by default, otherwise settings
        this._activeTab = isConnected ? TabType.TOOLS : TabType.SETTINGS
        this._update()
    }

    /**
     * Handle tab change event from the webview
     * @param tabId The ID of the tab to switch to
     */
    private _handleTabChange(tabId: TabType): void {
        this._activeTab = tabId
        this._update()
    }

    /**
     * Dispose of the webview panel and resources
     */
    public dispose(): void {
        ServerDetailWebview.panels = ServerDetailWebview.panels.filter(panel => panel !== this)
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
        const tool = this._schema.tools.find(t => t.name === toolName)
        if (!tool) {
            vscode.window.showErrorMessage(`Tool ${toolName} not found`)
            return
        }

        try {
            const start = Date.now()
            const response = await mcpCallTool(this._schema.name, toolName, params)
            // Ensure it takes at least 200ms to avoid the UI to glitch fast
            const end = Date.now()
            if (end - start < 200) {
                await new Promise(resolve => setTimeout(resolve, 200 - (end - start)))
            }

            if (!response || typeof response.success !== 'boolean') {
                this._panel.webview.postMessage({
                    command: 'toolResult',
                    toolName: toolName,
                    resultType: 'error',
                    contentType: 'text',
                    data: 'Invalid response from tool execution service.',
                })
                return
            }

            if (!response.success) {
                this._panel.webview.postMessage({
                    command: 'toolResult',
                    toolName: toolName,
                    resultType: 'error',
                    contentType: 'text',
                    data: response.error || 'Tool execution failed',
                })
                return
            }

            const data = response.data
            let resultType: 'success' | 'failed' = 'success' // Default to success
            let contentType = 'raw' // Default content type
            let contentData: any = data // Default to the whole data object
            let mimeType: string | undefined = undefined

            if (data && data.content && Array.isArray(data.content) && data.content.length > 0) {
                const mcpContent = data.content[0]
                if (data.isError === true) {
                    resultType = 'failed'
                }

                if (mcpContent.type === 'image' && mcpContent.data && mcpContent.mimeType) {
                    contentType = 'image'
                    contentData = mcpContent.data
                    mimeType = mcpContent.mimeType
                } else if (mcpContent.type === 'text' && mcpContent.text !== undefined) {
                    contentType = 'text'
                    contentData = mcpContent.text
                    try {
                        const jsonData = JSON.parse(mcpContent.text)
                        // If parsing succeeds, treat as JSON content for better display
                        contentType = 'json'
                        contentData = jsonData
                        if (jsonData.status === 'error') {
                            resultType = 'failed'
                        }
                    } catch (e) {
                        // Not JSON, keep as text. Check for error keyword.
                        if (mcpContent.text.toLowerCase().startsWith('error')) {
                            resultType = 'failed'
                        }
                    }
                }
            } else if (data && typeof data === 'object' && data.status === 'error') {
                resultType = 'failed'
            }

            this._panel.webview.postMessage({
                command: 'toolResult',
                toolName: toolName,
                resultType: resultType,
                contentType: contentType,
                mimeType: mimeType,
                data: contentData,
            })
        } catch (error) {
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
        const nonce = getNonce()
        const cssDiskPath = vscode.Uri.joinPath(
            this._extensionUri,
            'dist',
            'webviews',
            'css',
            'serverView.css'
        )
        const jsDiskPath = vscode.Uri.joinPath(
            this._extensionUri,
            'dist',
            'webviews',
            'js',
            'serverView.js'
        )
        const cssUri = this._panel.webview.asWebviewUri(cssDiskPath)
        const jsUri = this._panel.webview.asWebviewUri(jsDiskPath)

        const connectionStatus = this._isConnected ? 'Connected' : 'Disconnected'
        const connectionStatusClass = this._isConnected ? 'connected' : 'disconnected'
        const connectionButton = this._isConnected
            ? `<button id="disconnect-from-server-btn" class="disconnect-button">Disconnect</button>`
            : `<button id="connect-to-server-btn" class="connect-button">Connect</button>`

        const serverDetails = this._getServerConfigHtml()
        const toolsSection = this._getToolsSectionHtml()
        const logSection = this._getLogSectionHtml()

        const settingsTabActive = this._activeTab === TabType.SETTINGS ? 'active' : ''
        const toolsTabActive = this._activeTab === TabType.TOOLS ? 'active' : ''
        const logTabActive = this._activeTab === TabType.LOG ? 'active' : ''

        const replacements: Record<string, string> = {
            nonce: nonce,
            cssUri: cssUri.toString(),
            jsUri: jsUri.toString(),
            'webview.cspSource': this._panel.webview.cspSource,
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
            initialActiveTab: this._activeTab, // Pass the initial active tab to the JS
        }

        const htmlTemplatePath = 'dist/webviews/html/serverView.html'

        return getWebviewContent(
            this._panel.webview,
            this._extensionUri,
            htmlTemplatePath,
            replacements
        )
    }

    /**
     * Get the HTML for the server configuration section
     * @returns The HTML for the server configuration section
     */
    private _getServerConfigHtml(): string {
        let transportRows = ''
        if (this._schema.transportType === TransportType.STDIO && this._schema.stdioConfig) {
            const { cmd, args, cwd, environment } = this._schema.stdioConfig
            transportRows += `<tr><td class="property-name">Command</td><td>${this._escapeHtml(cmd)}</td></tr>`
            transportRows += `<tr><td class="property-name">Arguments</td><td>${this._escapeHtml(args.join(' '))}</td></tr>`
            if (cwd) {
                transportRows += `<tr><td class="property-name">Working Directory</td><td>${this._escapeHtml(cwd)}</td></tr>`
            }
            if (environment && Object.keys(environment).length > 0) {
                transportRows +=
                    '<tr><td class="property-name">Environment Variables</td><td><table class="nested-table">'
                transportRows += Object.entries(environment)
                    .map(
                        ([key, value]) =>
                            `<tr><td>${this._escapeHtml(key)}=${this._escapeHtml(value)}</td></tr>`
                    )
                    .join('')
                transportRows += '</table></td></tr>'
            }
        } else if (this._schema.transportType === TransportType.HTTP && this._schema.httpConfig) {
            const { url, headers } = this._schema.httpConfig
            transportRows += `<tr><td class="property-name">URL</td><td>${this._escapeHtml(url)}</td></tr>`
            if (headers && Object.keys(headers).length > 0) {
                transportRows +=
                    '<tr><td class="property-name">Headers</td><td><table class="nested-table">'
                transportRows += Object.entries(headers)
                    .map(
                        ([key, value]) =>
                            `<tr><td>${this._escapeHtml(key)}: ${this._escapeHtml(value)}</td></tr>`
                    )
                    .join('')
                transportRows += '</table></td></tr>'
            }
        }

        return `
            <div class="section">
                <div class="settings-section">
                    <div class="section-header">
                        <h2 class="section-title">Server Configuration</h2>
                        <button id="edit-server-btn" class="action-button" ${this._isConnected ? 'disabled' : ''} title="${this._isConnected ? 'Disconnect server to edit' : 'Edit server configuration'}">Edit</button>
                    </div>
                    <table class="settings-table">
                        <tr><td class="property-name">Transport Type</td><td>${this._schema.transportType}</td></tr>
                        ${transportRows}
                    </table>
                </div>
            </div>
            <div class="section">
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

        return tool.parameters
            .map(param => {
                const required = param.required ? '<span class="required-indicator">*</span>' : ''
                const escapedDefault =
                    param.default !== undefined ? this._escapeHtml(String(param.default)) : ''
                let input = ''

                switch (param.type) {
                    case ToolParameterType.STRING:
                        input = `<input type="text" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" value="${escapedDefault}" />`
                        break
                    case ToolParameterType.NUMBER:
                        input = `<input type="number" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" value="${escapedDefault}" />`
                        break
                    case ToolParameterType.BOOLEAN:
                        const isTrueDefault =
                            param.default === true || String(param.default).toLowerCase() === 'true'
                        input = `
                        <select id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}">
                            <option value="true" ${isTrueDefault ? 'selected' : ''}>true</option>
                            <option value="false" ${!isTrueDefault ? 'selected' : ''}>false</option>
                        </select>
                    `
                        break
                    case ToolParameterType.OBJECT:
                        input = `<textarea id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" rows="5" placeholder="{}">${escapedDefault}</textarea>`
                        break
                    case ToolParameterType.ARRAY:
                        input = `<input type="text" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" placeholder='["item1", "item2"]' value="${param.default ? this._escapeHtml(JSON.stringify(param.default)) : ''}" />`
                        break
                    default:
                        input = `<input type="text" id="${tool.name}-${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" value="${escapedDefault}"/>`
                }

                return `
                <div class="parameter-group">
                    <label for="${tool.name}-${param.name}" class="parameter-label">${this._escapeHtml(param.name)}${required}</label>
                    ${param.description ? `<div class="parameter-description">${this._escapeHtml(param.description)}</div>` : ''}
                    ${input}
                    <div class="parameter-error" data-error-for="${param.name}"></div>
                </div>
            `
            })
            .join('')
    }

    /**
     * Get the HTML for the log section
     * @returns The HTML for the log section
     */
    private _getLogSectionHtml(): string {
        const logs = LogService.getInstance().getLogs(this._schema.name)
        if (logs.length === 0) {
            return `
                <div class="section">
                    <h2 class="section-title">Log</h2>
                    <p class="tab-empty-message">No logs available for this server.</p>
                </div>
            `
        }

        const logEntriesHtml = logs
            .map((log, index) => {
                const timestamp = log.timestamp.toLocaleString()
                const statusClass = log.isError ? 'error' : 'success'
                const icon = log.isError ? '❌' : '✓'
                const hasRawData = !!log.rawData
                const expandableClass = hasRawData ? 'expandable' : ''
                const rawDataHtml = hasRawData
                    ? `<div class="log-raw-data hidden"><pre>${this._escapeHtml(typeof log.rawData === 'string' ? log.rawData : JSON.stringify(log.rawData, null, 2))}</pre></div>`
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
        if (typeof text !== 'string') {
            text = String(text)
        }
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
        if (!this._isConnected) {
            return `<div class="section"><p class="tab-empty-message">Please connect to the server to access tools.</p></div>`
        }
        if (this._isLoading) {
            return `<div class="section"><div class="loading"><div class="spinner"></div></div></div>`
        }
        if (!this._schema.tools || this._schema.tools.length === 0) {
            return `<div class="section"><p>No tools available for this server.</p></div>`
        }

        const toolsHtml = this._schema.tools
            .map(tool => {
                const parameterInputs = this._generateParameterInputs(tool)
                return `
                <div class="tool-card" id="tool-${this._escapeHtml(tool.name)}">
                    <div class="tool-header">
                        <span class="tool-name-chip">${this._escapeHtml(tool.name)}</span>
                    </div>
                    <p class="tool-description">${this._escapeHtml(tool.description || '')}</p>
                    <form class="tool-form" data-tool-name="${this._escapeHtml(tool.name)}">
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

        return `<div class="section">${toolsHtml}</div>`
    }
}
