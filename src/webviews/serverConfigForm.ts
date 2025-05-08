/**
 * Server Configuration Form
 *
 * This module provides a webview panel for adding and editing server configurations.
 */
import * as vscode from 'vscode'
import { ServerConfig, TransportType } from '../models/types'
import { connectToServer, getToolsList, disconnectFromServer } from '../services/mcpClient'
import { parseJsonConfig } from '../services/jsonParser'
import { getWebviewContent } from '../utils/webviewUtils'

/**
 * Class that manages the server configuration form webview panel
 */
export class ServerConfigForm {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: ServerConfigForm | undefined

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []
    private _server: ServerConfig = {
        name: '',
        description: '',
        transportType: TransportType.STDIO,
        stdioConfig: {
            cmd: '',
            args: [],
            cwd: '',
            environment: {},
        },
        sseConfig: {
            url: '',
            headers: {},
        },
    }
    private _isEditing: boolean = false
    private _isTesting: boolean = false
    private _validationErrors: Record<string, string> = {}

    /**
     * Get the static view type for the webview panel
     */
    public static readonly viewType = 'mcp4humans.serverConfigForm'

    /**
     * Create or show a server configuration form panel
     * @param extensionUri The URI of the extension
     * @param server The server configuration (if editing)
     */
    public static createOrShow(extensionUri: vscode.Uri, server?: ServerConfig): ServerConfigForm {
        const _isEditing = !!server
        const serverConfig = server || {
            name: '',
            description: '',
            transportType: TransportType.STDIO,
            stdioConfig: {
                cmd: '',
                args: [],
                cwd: '',
                environment: {},
            },
            sseConfig: {
                url: '',
                headers: {},
            },
        }
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        // If we already have a panel, show it
        if (ServerConfigForm.currentPanel) {
            ServerConfigForm.currentPanel._server = serverConfig
            ServerConfigForm.currentPanel._isEditing = _isEditing
            ServerConfigForm.currentPanel._panel.reveal(column)
            ServerConfigForm.currentPanel._update()
            return ServerConfigForm.currentPanel
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ServerConfigForm.viewType,
            _isEditing ? `Edit Server: ${server.name}` : 'Add Server',
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

        ServerConfigForm.currentPanel = new ServerConfigForm(
            panel,
            extensionUri,
            serverConfig,
            _isEditing
        )
        return ServerConfigForm.currentPanel
    }

    /**
     * Constructor
     * @param panel The webview panel
     * @param extensionUri The URI of the extension
     * @param server The server configuration (if editing)
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        server: ServerConfig,
        isEditing: boolean
    ) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._server = server
        this._isEditing = isEditing

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
            async message => {
                switch (message.command) {
                    case 'connectAndSave':
                        // Replace server data with html form data
                        this._server = message.server
                        await this._handleConnectAndSave()
                        return
                    case 'parseJson':
                        this._handleParseJson(message.json)
                        return
                }
            },
            null,
            this._disposables
        )
    }

    /**
     * Dispose of the webview panel and resources
     */
    public dispose(): void {
        ServerConfigForm.currentPanel = undefined

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
     * Handle connecting to and saving the server configuration
     * @param server The server configuration to save
     */
    private async _handleConnectAndSave(): Promise<void> {
        // Validate the server configuration
        const validationErrors = this._validateServer()
        if (Object.keys(validationErrors).length > 0) {
            this._validationErrors = validationErrors
            this._update()
            return
        }

        // Connect to the server
        this._isTesting = true
        this._update()

        const connectResponse = await connectToServer(this._server)
        if (!connectResponse.success) {
            this._isTesting = false
            vscode.window.showErrorMessage(`Failed to connect to server: ${connectResponse.error}`)
            this._update()
            return
        }

        // Test getting tools
        const toolsResponse = await getToolsList(this._server.name)
        if (!toolsResponse.success) {
            this._isTesting = false
            vscode.window.showErrorMessage(
                `Failed to get tools from server: ${toolsResponse.error}`
            )

            // Make sure it's disconnected
            await disconnectFromServer(this._server.name)
            this._update()
            return
        }

        this._isTesting = false

        // Save the server configuration
        vscode.commands.executeCommand('mcp4humans.saveServer', this._server, this._isEditing)

        // Refresh the server list
        vscode.commands.executeCommand('mcp4humans.refreshServerList')

        // Open detail window to show it's configured and connected
        vscode.commands.executeCommand('mcp4humans.openServerDetail', this._server)

        // Close the form
        this._panel.dispose()
    }

    /**
     * Handle parsing JSON configuration
     * @param json The JSON string to parse
     */
    private _handleParseJson(json: string): void {
        // Use the flexible JSON parser
        const result = parseJsonConfig(json)

        if (result.success && result.data) {
            // Update the server configuration
            this._server = result.data
            this._validationErrors = {}
            this._update()
        } else {
            vscode.window.showErrorMessage(
                `Failed to parse JSON: ${result.error || 'Unknown error'}`
            )
        }
    }

    /**
     * Validate the server configuration
     * @returns Validation errors
     */
    private _validateServer(): Record<string, string> {
        const errors: Record<string, string> = {}

        if (!this._server.name) {
            errors.name = 'Server name is required'
        }

        if (!this._server.transportType) {
            errors.transportType = 'Transport type is required'
        }

        if (this._server.transportType === TransportType.STDIO) {
            if (!this._server.stdioConfig) {
                errors.stdioConfig = 'STDIO configuration is required'
            } else {
                if (!this._server.stdioConfig.cmd) {
                    errors['stdioConfig.cmd'] = 'Command is required'
                } else if (!this._server.stdioConfig.args) {
                    errors['stdioConfig.args'] = 'Arguments are required'
                }
            }
        }

        if (this._server.transportType === TransportType.SSE) {
            if (!this._server.sseConfig) {
                errors.sseConfig = 'SSE configuration is required'
            } else {
                if (!this._server.sseConfig.url) {
                    errors['sseConfig.url'] = 'URL is required'
                } else {
                    // Validate URL format
                    const urlRegex = /^(http|https):\/\/[a-zA-Z0-9.-]+:[0-9]+\/sse$/
                    if (!urlRegex.test(this._server.sseConfig.url)) {
                        errors['sseConfig.url'] =
                            'Invalid SSE URL format. Expected: http[s]://{host}:{port}/sse'
                    }
                }
            }
        }

        return errors
    }

    /**
     * Update the webview content
     */
    private _update(): void {
        this._panel.title =
            this._isEditing && this._server ? `Edit Server: ${this._server.name}` : 'Add Server'
        this._panel.webview.html = this._getHtmlForWebview()
    }

    /**
     * Get the HTML for the webview
     * @returns The HTML for the webview
     */
    private _getHtmlForWebview(): string {
        // Generate environment variables HTML
        let stdioEnvVars = ''
        let hasEnvVars = false
        if (
            this._server.stdioConfig?.environment &&
            typeof this._server.stdioConfig.environment === 'object' &&
            Object.keys(this._server.stdioConfig.environment).length > 0
        ) {
            hasEnvVars = true
            stdioEnvVars = Object.entries(this._server.stdioConfig.environment)
                .map(
                    ([key, value]) => `
                    <tr>
                        <td><input type="text" class="env-name" value="${key}" /></td>
                        <td><input type="text" class="env-value" value="${value}" /></td>
                        <td><div class="trash-icon remove-env-btn">🗑️</div></td>
                    </tr>
                `
                )
                .join('')
        }

        // Generate headers HTML
        let sseHeaders = ''
        let hasHeaders = false
        if (
            this._server.sseConfig?.headers &&
            Object.keys(this._server.sseConfig.headers).length > 0
        ) {
            hasHeaders = true
            sseHeaders = Object.entries(this._server.sseConfig.headers)
                .map(
                    ([key, value]) => `
                    <tr>
                        <td><input type="text" class="header-name" value="${key}" /></td>
                        <td><input type="text" class="header-value" value="${value}" /></td>
                        <td><div class="trash-icon remove-header-btn">🗑️</div></td>
                    </tr>
                `
                )
                .join('')
        }

        // Prepare replacements for the template
        const replacements: Record<string, string> = {
            title: this._isEditing ? `Edit Server: ${this._server.name}` : 'Add Server',
            serverName: this._server.name,
            serverDescription: this._server.description || '',
            stdioChecked: this._server.transportType === TransportType.STDIO ? 'checked' : '',
            sseChecked: this._server.transportType === TransportType.SSE ? 'checked' : '',
            stdioHidden: this._server.transportType !== TransportType.STDIO ? 'hidden' : '',
            sseHidden: this._server.transportType !== TransportType.SSE ? 'hidden' : '',
            stdioCmd: this._server.stdioConfig?.cmd || '',
            stdioArgs: this._server.stdioConfig?.args?.join(',') || '',
            stdioCwd: this._server.stdioConfig?.cwd || '',
            stdioEnvVars: stdioEnvVars,
            hasEnvVars: hasEnvVars ? 'true' : 'false',
            sseUrl: this._server.sseConfig?.url || '',
            sseHeaders: sseHeaders,
            hasHeaders: hasHeaders ? 'true' : 'false',
            // Add a timestamp to force the webview to refresh even when content is identical
            timestamp: Date.now().toString(),
            nameError: this._validationErrors.name
                ? `<div class="error">${this._validationErrors.name}</div>`
                : '',
            transportTypeError: this._validationErrors.transportType
                ? `<div class="error">${this._validationErrors.transportType}</div>`
                : '',
            stdioCmdError: this._validationErrors['stdioConfig.cmd']
                ? `<div class="error">${this._validationErrors['stdioConfig.cmd']}</div>`
                : '',
            stdioArgsError: this._validationErrors['stdioConfig.args']
                ? `<div class="error">${this._validationErrors['stdioConfig.args']}</div>`
                : '',
            sseUrlError: this._validationErrors['sseConfig.url']
                ? `<div class="error">${this._validationErrors['sseConfig.url']}</div>`
                : '',
            loadingSpinner: this._isTesting
                ? `
                <div class="loading">
                    <div class="spinner"></div>
                </div>
            `
                : '',
        }

        // Get the HTML content using the template
        return getWebviewContent(
            this._panel.webview,
            this._extensionUri,
            'src/webviews/templates/serverConfigForm.html',
            replacements
        )
    }
}
