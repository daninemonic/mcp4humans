/**
 * Server Detail Webview
 *
 * This module provides a webview panel for displaying server details and tools.
 */
import * as vscode from 'vscode'
import { ServerConfig, Tool, ToolParameterType } from '../models/types'
import { getToolsList, executeTool } from '../services/mcpClient'
import { getWebviewContent } from '../utils/webviewUtils'

/**
 * Class that manages the server detail webview panel
 */
export class ServerDetailWebview {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: ServerDetailWebview | undefined

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []
    private _server: ServerConfig
    private _isConnected: boolean = false
    private _isLoading: boolean = false
    private _tools: Tool[] = []

    /**
     * Get the static view type for the webview panel
     */
    public static readonly viewType = 'mcp4humans.serverDetail'

    /**
     * Create or show a server detail panel
     * @param extensionUri The URI of the extension
     * @param server The server configuration
     * @param isConnected Whether the server is connected
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        server: ServerConfig,
        isConnected: boolean
    ): ServerDetailWebview {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        // If we already have a panel, reuse it but keep in mind that if
        // it's a different server we need to get the tools again
        if (ServerDetailWebview.currentPanel) {
            ServerDetailWebview.currentPanel._panel.reveal(column)
            // If the server is connected, load the tools for the new server
            if (isConnected && ServerDetailWebview.currentPanel._server.name !== server.name) {
                ServerDetailWebview.currentPanel._loadTools()
            }
            ServerDetailWebview.currentPanel.update(server, isConnected)
            return ServerDetailWebview.currentPanel
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ServerDetailWebview.viewType,
            `Server: ${server.name}`,
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

        ServerDetailWebview.currentPanel = new ServerDetailWebview(
            panel,
            extensionUri,
            server,
            isConnected
        )
        return ServerDetailWebview.currentPanel
    }

    /**
     * Constructor
     * @param panel The webview panel
     * @param extensionUri The URI of the extension
     * @param server The server configuration
     * @param isConnected Whether the server is connected
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        server: ServerConfig,
        isConnected: boolean
    ) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._server = server
        this._isConnected = isConnected

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
                        this._handleConnect()
                        return
                    case 'disconnect':
                        this._handleDisconnect()
                        return
                    case 'editServer':
                        this._handleEditServer()
                        return
                    case 'deleteServer':
                        this._handleDeleteServer()
                        return
                    case 'executeTool':
                        this._handleExecuteTool(message.toolName, message.params)
                        return
                }
            },
            null,
            this._disposables
        )

        // If the server is connected, load the tools
        if (isConnected) {
            this._loadTools()
        }
    }

    /**
     * Update the server and connection status
     * @param server The server configuration
     * @param isConnected Whether the server is connected
     */
    public update(server: ServerConfig, isConnected: boolean): void {
        this._server = server

        // If the connection status changed from disconnected to connected, load the tools
        if (!this._isConnected && isConnected) {
            this._loadTools()
        }

        this._isConnected = isConnected
        this._panel.title = `Server: ${server.name}`
        this._update()
    }

    /**
     * Dispose of the webview panel and resources
     */
    public dispose(): void {
        ServerDetailWebview.currentPanel = undefined

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
     * Load the tools for the server
     */
    private async _loadTools(): Promise<void> {
        this._isLoading = true
        this._update()

        // Get the tools from the MCP client
        const response = await getToolsList(this._server.name)

        this._isLoading = false

        if (response.success && response.data) {
            this._tools = response.data
        } else {
            if (response.error) {
                vscode.window.showErrorMessage(`Failed to get tools: ${response.error}`)
            }
            this._tools = []
        }

        this._update()
    }

    /**
     * Handle the connect button click
     */
    private _handleConnect(): void {
        vscode.commands.executeCommand('mcp4humans.connectServer', this._server)
    }

    /**
     * Handle the disconnect button click
     */
    private _handleDisconnect(): void {
        vscode.commands.executeCommand('mcp4humans.disconnectServer', this._server)
    }

    /**
     * Handle the edit server button click
     */
    private _handleEditServer(): void {
        vscode.commands.executeCommand('mcp4humans.editServer', this._server)
    }

    /**
     * Handle the delete server button click
     */
    private _handleDeleteServer(): void {
        vscode.commands.executeCommand('mcp4humans.deleteServer', this._server)
        this._panel.dispose()
    }

    /**
     * Handle the execute tool button click
     * @param toolName The name of the tool to execute
     * @param params The parameters for the tool
     */
    private async _handleExecuteTool(toolName: string, params: any): Promise<void> {
        // Find the tool by name
        const tool = this._tools.find(t => t.name === toolName)
        if (!tool) {
            vscode.window.showErrorMessage(`Tool ${toolName} not found`)
            return
        }

        try {
            // Execute the tool
            const response = await executeTool(this._server.name, toolName, params)

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

            // Process the successful response
            const data = response.data

            // Check if the response has the MCP content format
            if (data && data.content && Array.isArray(data.content) && data.content.length > 0) {
                const content = data.content[0]

                // Check if the response contains an error flag
                const isError = content.isError === true

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
                        this._panel.webview.postMessage({
                            command: 'toolResult',
                            toolName: toolName,
                            resultType: isError ? 'failed' : 'success',
                            contentType: 'json',
                            data: jsonData,
                        })
                    } catch (e) {
                        // Not valid JSON, send as text
                        this._panel.webview.postMessage({
                            command: 'toolResult',
                            toolName: toolName,
                            resultType: isError ? 'failed' : 'success',
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
                this._panel.webview.postMessage({
                    command: 'toolResult',
                    toolName: toolName,
                    resultType: 'success',
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

        // Prepare replacements for the template
        const replacements: Record<string, string> = {
            serverName: this._server.name,
            serverDescription: this._server.description || '',
            connectionStatus: connectionStatus,
            connectionStatusClass: connectionStatusClass,
            connectionButton: connectionButton,
            serverDetails: serverDetails,
            toolsSection: toolsSection,
        }

        // Get the HTML content using the template
        return getWebviewContent(
            this._panel.webview,
            this._extensionUri,
            'src/webviews/templates/serverDetailWebview.html',
            replacements
        )
    }

    /**
     * Get the HTML for the server configuration section
     * @returns The HTML for the server configuration section
     */
    private _getServerConfigHtml(): string {
        // Get the transport-specific configuration
        let transportConfig = ''
        if (this._server.transportType === 'stdio') {
            const stdioConfig = this._server.stdioConfig
            if (stdioConfig) {
                transportConfig = `
                    <div class="property">
                        <span class="property-name">Command:</span> ${stdioConfig.cmd}
                    </div>
                    <div class="property">
                        <span class="property-name">Arguments:</span> ${stdioConfig.args.join(' ')}
                    </div>
                    ${
                        stdioConfig.cwd
                            ? `
                    <div class="property">
                        <span class="property-name">Working Directory:</span> ${stdioConfig.cwd}
                    </div>
                    `
                            : ''
                    }
                `
            }
        } else if (this._server.transportType === 'sse') {
            const sseConfig = this._server.sseConfig
            if (sseConfig) {
                transportConfig = `
                    <div class="property">
                        <span class="property-name">URL:</span> ${sseConfig.url}
                    </div>
                    ${
                        sseConfig.headers
                            ? `
                    <div class="property">
                        <span class="property-name">Headers:</span>
                        <pre>${JSON.stringify(sseConfig.headers, null, 2)}</pre>
                    </div>
                    `
                            : ''
                    }
                `
            }
        }

        // Return the server configuration section
        return `
            <div class="section">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 class="section-title">Server Configuration</h2>
                    <button id="edit-server-btn" ${this._isConnected ? 'disabled' : ''} title="${this._isConnected ? 'Disconnect server to edit' : 'Edit server configuration'}">Edit</button>
                </div>
                <div class="property">
                    <span class="property-name">Transport Type:</span> ${this._server.transportType}
                </div>
                ${transportConfig}
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
     * Get the HTML for the tools section
     * @returns The HTML for the tools section
     */
    private _getToolsSectionHtml(): string {
        // If the server is not connected, show a message
        if (!this._isConnected) {
            return `
                <div class="section">
                    <h2 class="section-title">Tools</h2>
                    <p>Connect to the server to view available tools.</p>
                </div>
            `
        }

        // If the tools are loading, show a spinner
        if (this._isLoading) {
            return `
                <div class="section">
                    <h2 class="section-title">Tools</h2>
                    <div class="loading">
                        <div class="spinner"></div>
                    </div>
                </div>
            `
        }

        // If there are no tools, show a message
        if (this._tools.length === 0) {
            return `
                <div class="section">
                    <h2 class="section-title">Tools</h2>
                    <p>No tools available for this server.</p>
                </div>
            `
        }

        // Generate HTML for each tool
        const toolsHtml = this._tools
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
                                <span class="result-status-icon"></span>
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
                <h2 class="section-title">Tools</h2>
                ${toolsHtml}
            </div>
        `
    }
}
