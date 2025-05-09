/**
 * Server Configuration Form
 *
 * This module provides a webview panel for adding and editing server configurations.
 */
import * as vscode from 'vscode'
import { ServerConfig, TransportType } from '../../models/types'
import { jsonConfigParser } from '../../services/jsonConfigParser'
import { getWebviewContent } from '../../utils/webviewUtils'
import { vscServerViewDetail } from '../../models/commands'
import { mcpConnectAndBuildSchema } from '../../utils/mcpUtils'

// Function to generate a nonce
function getNonce() {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

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
    private _config: ServerConfig = {
        name: '',
        description: '',
        transportType: TransportType.STDIO,
        stdioConfig: {
            cmd: '',
            args: [],
            cwd: '',
            environment: {},
        },
        httpConfig: {
            url: '',
            headers: {},
        },
    }
    private _originalName: string // to keep name in case editing changes it
    private _isEditing: boolean = false
    private _validationErrors: Record<string, string> = {}

    /**
     * Get the static view type for the webview panel
     */
    public static readonly viewType = 'mcp4humans.serverConfigForm'

    /**
     * Create or show a server configuration form panel
     * @param extensionUri The URI of the extension
     * @param config The server configuration (if editing)
     */
    public static createOrShow(extensionUri: vscode.Uri, config?: ServerConfig): ServerConfigForm {
        const _isEditing = !!config
        const serverConfig = config || {
            name: '',
            description: '',
            transportType: TransportType.STDIO,
            stdioConfig: {
                cmd: '',
                args: [],
                cwd: '',
                environment: {},
            },
            httpConfig: {
                url: '',
                headers: {},
            },
        }
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        // If we already have a panel, show it
        if (ServerConfigForm.currentPanel) {
            ServerConfigForm.currentPanel._config = serverConfig
            ServerConfigForm.currentPanel._isEditing = _isEditing
            ServerConfigForm.currentPanel._panel.reveal(column)
            ServerConfigForm.currentPanel._update()
            return ServerConfigForm.currentPanel
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ServerConfigForm.viewType,
            _isEditing && config ? `Edit Server: ${config.name}` : 'Add Server',
            column || vscode.ViewColumn.One,
            {
                // Enable JavaScript in the webview
                enableScripts: true,
                // Restrict the webview to only load resources from the extension's directory
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist'), // For general resources in dist
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webviews', 'css'),
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webviews', 'client'),
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webviews', 'html'),
                ],
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
     * @param config The server configuration (if editing)
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        config: ServerConfig,
        isEditing: boolean
    ) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._config = config
        this._isEditing = isEditing
        this._originalName = config.name

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
                        this._config = message.server
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
     */
    private async _handleConnectAndSave(): Promise<void> {
        // Validate the server configuration
        const validationErrors = this._validateServerConfig()
        if (Object.keys(validationErrors).length > 0) {
            this._validationErrors = validationErrors
            this._update()
            return
        }

        // Connects to the server and handles all storage and UI updates
        const schema = await mcpConnectAndBuildSchema(
            this._config,
            !this._isEditing,
            this._originalName
        )
        if (schema) {
            this._originalName = schema.name // update to name saved
            // Open detail window to show it's configured and connected
            vscServerViewDetail(schema)

            // Close the form
            this._panel.dispose()
        } else {
            this._update()
        }
    }

    /**
     * Handle parsing JSON configuration
     * @param json The JSON string to parse
     */
    private _handleParseJson(json: string): void {
        // Use the flexible JSON parser
        const result = jsonConfigParser(json)

        if (result.success && result.data) {
            // Update the server configuration
            this._config = result.data
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
    private _validateServerConfig(): Record<string, string> {
        const errors: Record<string, string> = {}

        if (!this._config.name) {
            errors.name = 'Server name is required'
        }

        if (!this._config.transportType) {
            errors.transportType = 'Transport type is required'
        }

        if (this._config.transportType === TransportType.STDIO) {
            if (!this._config.stdioConfig) {
                errors.stdioConfig = 'STDIO configuration is required'
            } else if (!this._config.stdioConfig.cmd) {
                errors['stdioConfig.cmd'] = 'Command is required'
            }
        }

        if (this._config.transportType === TransportType.HTTP) {
            if (!this._config.httpConfig) {
                errors.httpConfig = 'HTTP configuration is required'
            } else {
                if (!this._config.httpConfig.url) {
                    errors['httpConfig.url'] = 'URL is required'
                } else {
                    // Validate URL format
                    const urlRegex = /^(http|https):\/\/[a-zA-Z0-9.-:]+\/(mcp|sse)$/
                    if (!urlRegex.test(this._config.httpConfig.url)) {
                        errors['httpConfig.url'] =
                            'Invalid HTTP URL format. Expected: (http|https)://.../(mcp|sse)'
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
            this._isEditing && this._config ? `Edit Server: ${this._config.name}` : 'Add Server'
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
            'editSettings.css'
        )
        const jsDiskPath = vscode.Uri.joinPath(
            this._extensionUri,
            'dist',
            'webviews',
            'js',
            'editSettings.js'
        )

        const cssUri = this._panel.webview.asWebviewUri(cssDiskPath)
        const jsUri = this._panel.webview.asWebviewUri(jsDiskPath)

        let stdioEnvVars = ''
        let hasEnvVars = false
        if (
            this._config.stdioConfig?.environment &&
            typeof this._config.stdioConfig.environment === 'object' &&
            Object.keys(this._config.stdioConfig.environment).length > 0
        ) {
            hasEnvVars = true
            stdioEnvVars = Object.entries(this._config.stdioConfig.environment)
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

        let httpHeaders = ''
        let hasHeaders = false
        if (
            this._config.httpConfig?.headers &&
            Object.keys(this._config.httpConfig.headers).length > 0
        ) {
            hasHeaders = true
            httpHeaders = Object.entries(this._config.httpConfig.headers)
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

        const replacements: Record<string, string> = {
            nonce: nonce,
            cssUri: cssUri.toString(),
            jsUri: jsUri.toString(),
            'webview.cspSource': this._panel.webview.cspSource,

            title:
                this._isEditing && this._config
                    ? `Edit Server: ${this._config.name}`
                    : 'Add Server',
            serverName: this._config.name,
            serverDescription: this._config.description || '',
            stdioChecked: this._config.transportType === TransportType.STDIO ? 'checked' : '',
            httpChecked: this._config.transportType === TransportType.HTTP ? 'checked' : '',
            stdioHidden: this._config.transportType !== TransportType.STDIO ? 'hidden' : '',
            httpHidden: this._config.transportType !== TransportType.HTTP ? 'hidden' : '',
            stdioCmd: this._config.stdioConfig?.cmd || '',
            stdioArgs: this._config.stdioConfig?.args?.join(',') || '',
            stdioCwd: this._config.stdioConfig?.cwd || '',
            stdioEnvVars: stdioEnvVars,
            hasEnvVars: hasEnvVars ? 'true' : 'false',
            httpUrl: this._config.httpConfig?.url || '',
            httpHeaders: httpHeaders,
            hasHeaders: hasHeaders ? 'true' : 'false',
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
            httpUrlError: this._validationErrors['httpConfig.url']
                ? `<div class="error">${this._validationErrors['httpConfig.url']}</div>`
                : '',
        }

        const htmlTemplatePath = 'dist/webviews/html/editSettings.html'

        return getWebviewContent(
            this._panel.webview,
            this._extensionUri,
            htmlTemplatePath,
            replacements
        )
    }
}
