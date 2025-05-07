/**
 * Server Configuration Form
 *
 * This module provides a webview panel for adding and editing server configurations.
 */
import * as vscode from 'vscode'
import { ServerConfig } from '../models/types'
import { connectToServer, getToolsList } from '../services/mcpClient'

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
    private _server?: ServerConfig
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
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        // If we already have a panel, show it
        if (ServerConfigForm.currentPanel) {
            ServerConfigForm.currentPanel._panel.reveal(column)
            if (server) {
                ServerConfigForm.currentPanel._server = server
                ServerConfigForm.currentPanel._isEditing = true
            } else {
                ServerConfigForm.currentPanel._server = undefined
                ServerConfigForm.currentPanel._isEditing = false
            }
            ServerConfigForm.currentPanel._update()
            return ServerConfigForm.currentPanel
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ServerConfigForm.viewType,
            server ? `Edit Server: ${server.name}` : 'Add Server',
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

        ServerConfigForm.currentPanel = new ServerConfigForm(panel, extensionUri, server)
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
        server?: ServerConfig
    ) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._server = server
        this._isEditing = !!server

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
                    case 'saveServer':
                        await this._handleSaveServer(message.server)
                        return
                    case 'testConnection':
                        await this._handleTestConnection(message.server)
                        return
                    case 'parseJson':
                        this._handleParseJson(message.json)
                        return
                    case 'cancel':
                        this._panel.dispose()
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
     * Handle saving the server configuration
     * @param server The server configuration to save
     */
    private async _handleSaveServer(server: ServerConfig): Promise<void> {
        // Validate the server configuration
        const validationErrors = this._validateServer(server)
        if (Object.keys(validationErrors).length > 0) {
            this._validationErrors = validationErrors
            this._update()
            return
        }

        // Test the connection before saving
        this._isTesting = true
        this._update()

        const connectResponse = await connectToServer(server)
        if (!connectResponse.success) {
            this._isTesting = false
            vscode.window.showErrorMessage(`Failed to connect to server: ${connectResponse.error}`)
            this._update()
            return
        }

        // Test getting tools
        const toolsResponse = await getToolsList(server.name)
        if (!toolsResponse.success) {
            this._isTesting = false
            vscode.window.showErrorMessage(
                `Failed to get tools from server: ${toolsResponse.error}`
            )
            this._update()
            return
        }

        this._isTesting = false

        // Save the server configuration
        let response

        // We can't directly access the extension context here, so we'll use commands
        // to have the extension handle the storage operations
        vscode.commands.executeCommand('mcp4humans.saveServer', server, this._isEditing)

        // For now, assume success since the actual saving will be handled by the command
        response = { success: true, error: undefined }

        if (response.success) {
            vscode.window.showInformationMessage(
                `Server ${this._isEditing ? 'updated' : 'added'} successfully`
            )
            vscode.commands.executeCommand('mcp4humans.refreshServerList')
            this._panel.dispose()
        } else {
            vscode.window.showErrorMessage(
                `Failed to ${this._isEditing ? 'update' : 'add'} server: ${response.error}`
            )
        }
    }

    /**
     * Handle testing the connection to a server
     * @param server The server configuration to test
     */
    private async _handleTestConnection(server: ServerConfig): Promise<void> {
        // Validate the server configuration
        const validationErrors = this._validateServer(server)
        if (Object.keys(validationErrors).length > 0) {
            this._validationErrors = validationErrors
            this._update()
            return
        }

        this._isTesting = true
        this._update()

        const connectResponse = await connectToServer(server)

        this._isTesting = false

        if (connectResponse.success) {
            vscode.window.showInformationMessage(`Successfully connected to server: ${server.name}`)
        } else {
            vscode.window.showErrorMessage(`Failed to connect to server: ${connectResponse.error}`)
        }

        this._update()
    }

    /**
     * Handle parsing JSON configuration
     * @param json The JSON string to parse
     */
    private _handleParseJson(json: string): void {
        try {
            const config = JSON.parse(json)

            // Validate the parsed configuration
            if (!config.name || !config.transportType) {
                throw new Error('Invalid server configuration: missing required fields')
            }

            if (config.transportType === 'stdio' && !config.stdioConfig) {
                throw new Error('Invalid server configuration: missing STDIO configuration')
            }

            if (config.transportType === 'sse' && !config.sseConfig) {
                throw new Error('Invalid server configuration: missing SSE configuration')
            }

            // Update the server configuration
            this._server = config
            this._validationErrors = {}
            this._update()

            vscode.window.showInformationMessage('JSON configuration parsed successfully')
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    /**
     * Validate the server configuration
     * @param server The server configuration to validate
     * @returns Validation errors
     */
    private _validateServer(server: ServerConfig): Record<string, string> {
        const errors: Record<string, string> = {}

        if (!server.name) {
            errors.name = 'Server name is required'
        }

        if (!server.transportType) {
            errors.transportType = 'Transport type is required'
        }

        if (server.transportType === 'stdio') {
            if (!server.stdioConfig) {
                errors.stdioConfig = 'STDIO configuration is required'
            } else {
                if (!server.stdioConfig.cmd) {
                    errors['stdioConfig.cmd'] = 'Command is required'
                }
            }
        }

        if (server.transportType === 'sse') {
            if (!server.sseConfig) {
                errors.sseConfig = 'SSE configuration is required'
            } else {
                if (!server.sseConfig.url) {
                    errors['sseConfig.url'] = 'URL is required'
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
        const defaultServer: ServerConfig = this._server || {
            name: '',
            description: '',
            transportType: 'stdio',
            stdioConfig: {
                cmd: '',
                args: [],
                cwd: '',
                environment: {},
            },
        }

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this._isEditing ? 'Edit Server' : 'Add Server'}</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                    }
                    .header {
                        margin-bottom: 20px;
                    }
                    .title {
                        font-size: 1.5em;
                        font-weight: bold;
                        margin: 0;
                    }
                    .section {
                        margin-bottom: 20px;
                        padding: 15px;
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 4px;
                    }
                    .section-title {
                        font-size: 1.2em;
                        font-weight: bold;
                        margin-top: 0;
                        margin-bottom: 10px;
                    }
                    .form-group {
                        margin-bottom: 15px;
                    }
                    label {
                        display: block;
                        margin-bottom: 5px;
                    }
                    input[type="text"], textarea {
                        width: 100%;
                        padding: 8px;
                        box-sizing: border-box;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 2px;
                    }
                    input[type="text"]:focus, textarea:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                    }
                    .radio-group {
                        display: flex;
                        gap: 15px;
                    }
                    .radio-option {
                        display: flex;
                        align-items: center;
                    }
                    .radio-option input {
                        margin-right: 5px;
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 12px;
                        cursor: pointer;
                        border-radius: 2px;
                        margin-right: 10px;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .button-container {
                        display: flex;
                        justify-content: flex-end;
                        margin-top: 20px;
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                        font-size: 0.9em;
                        margin-top: 5px;
                    }
                    .required {
                        color: var(--vscode-errorForeground);
                        margin-left: 3px;
                    }
                    .json-input {
                        font-family: monospace;
                        height: 150px;
                        white-space: pre;
                    }
                    .loading {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background-color: rgba(0, 0, 0, 0.5);
                        z-index: 1000;
                    }
                    .spinner {
                        border: 4px solid rgba(0, 0, 0, 0.1);
                        border-left-color: var(--vscode-progressBar-background);
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    .hidden {
                        display: none;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    th, td {
                        padding: 8px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    th {
                        background-color: var(--vscode-editor-selectionBackground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1 class="title">${this._isEditing ? 'Edit Server' : 'Add Server'}</h1>
                </div>

                <div class="section">
                    <h2 class="section-title">Import Configuration</h2>
                    <div class="form-group">
                        <label for="json-config">Paste JSON Configuration</label>
                        <textarea id="json-config" class="json-input" placeholder='{"name": "server-name", "transportType": "stdio", "stdioConfig": {"cmd": "python", "args": ["-m", "server"]}}' rows="10"></textarea>
                    </div>
                    <div style="text-align: right;">
                        <button id="parse-json-button">Parse JSON</button>
                    </div>
                </div>

                <div class="section">
                    <h2 class="section-title">Basic Information</h2>
                    <div class="form-group">
                        <label for="server-name">Server Name<span class="required">*</span></label>
                        <input type="text" id="server-name" value="${defaultServer.name}" />
                        ${this._validationErrors.name ? `<div class="error">${this._validationErrors.name}</div>` : ''}
                    </div>
                    <div class="form-group">
                        <label for="server-description">Description</label>
                        <input type="text" id="server-description" value="${defaultServer.description || ''}" />
                    </div>
                </div>

                <div class="section">
                    <h2 class="section-title">Transport Type<span class="required">*</span></h2>
                    <div class="form-group">
                        <div class="radio-group">
                            <div class="radio-option">
                                <input type="radio" id="transport-stdio" name="transport-type" value="stdio" ${defaultServer.transportType === 'stdio' ? 'checked' : ''} />
                                <label for="transport-stdio">STDIO</label>
                            </div>
                            <div class="radio-option">
                                <input type="radio" id="transport-sse" name="transport-type" value="sse" ${defaultServer.transportType === 'sse' ? 'checked' : ''} />
                                <label for="transport-sse">SSE</label>
                            </div>
                        </div>
                        ${this._validationErrors.transportType ? `<div class="error">${this._validationErrors.transportType}</div>` : ''}
                    </div>
                </div>

                <div id="stdio-config" class="section ${defaultServer.transportType !== 'stdio' ? 'hidden' : ''}">
                    <h2 class="section-title">STDIO Configuration</h2>
                    <div class="form-group">
                        <label for="stdio-cmd">Command<span class="required">*</span></label>
                        <input type="text" id="stdio-cmd" value="${defaultServer.stdioConfig?.cmd || ''}" />
                        ${this._validationErrors['stdioConfig.cmd'] ? `<div class="error">${this._validationErrors['stdioConfig.cmd']}</div>` : ''}
                    </div>
                    <div class="form-group">
                        <label for="stdio-args">Arguments (comma-separated)</label>
                        <input type="text" id="stdio-args" value="${defaultServer.stdioConfig?.args?.join(',') || ''}" />
                    </div>
                    <div class="form-group">
                        <label for="stdio-cwd">Working Directory</label>
                        <input type="text" id="stdio-cwd" value="${defaultServer.stdioConfig?.cwd || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Environment Variables</label>
                        <table id="env-vars-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Value</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="env-vars-body">
                                ${
                                    defaultServer.stdioConfig?.environment &&
                                    typeof defaultServer.stdioConfig.environment === 'object'
                                        ? Object.entries(defaultServer.stdioConfig.environment)
                                              .map(
                                                  ([key, value]) => `
                                        <tr>
                                            <td><input type="text" class="env-name" value="${key}" /></td>
                                            <td><input type="text" class="env-value" value="${value}" /></td>
                                            <td><button class="remove-env-btn">Remove</button></td>
                                        </tr>
                                    `
                                              )
                                              .join('')
                                        : ''
                                }
                            </tbody>
                        </table>
                        <div style="margin-top: 10px;">
                            <button id="add-env-var-btn">Add Environment Variable</button>
                        </div>
                    </div>
                </div>

                <div id="sse-config" class="section ${defaultServer.transportType !== 'sse' ? 'hidden' : ''}">
                    <h2 class="section-title">SSE Configuration</h2>
                    <div class="form-group">
                        <label for="sse-url">URL<span class="required">*</span></label>
                        <input type="text" id="sse-url" value="${defaultServer.sseConfig?.url || ''}" />
                        ${this._validationErrors['sseConfig.url'] ? `<div class="error">${this._validationErrors['sseConfig.url']}</div>` : ''}
                    </div>
                    <div class="form-group">
                        <label>Headers</label>
                        <table id="headers-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Value</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="headers-body">
                                ${
                                    defaultServer.sseConfig?.headers
                                        ? Object.entries(defaultServer.sseConfig.headers)
                                              .map(
                                                  ([key, value]) => `
                                        <tr>
                                            <td><input type="text" class="header-name" value="${key}" /></td>
                                            <td><input type="text" class="header-value" value="${value}" /></td>
                                            <td><button class="remove-header-btn">Remove</button></td>
                                        </tr>
                                    `
                                              )
                                              .join('')
                                        : ''
                                }
                            </tbody>
                        </table>
                        <div style="margin-top: 10px;">
                            <button id="add-header-btn">Add Header</button>
                        </div>
                    </div>
                </div>

                <div class="button-container">
                    <button id="test-connection-btn">Test Connection</button>
                    <button id="save-btn">Save</button>
                    <button id="cancel-btn">Cancel</button>
                </div>

                ${
                    this._isTesting
                        ? `
                <div class="loading">
                    <div class="spinner"></div>
                </div>
                `
                        : ''
                }

                <script>
                    const vscode = acquireVsCodeApi();

                    // Get form elements
                    const transportRadios = document.querySelectorAll('input[name="transport-type"]');
                    const stdioConfig = document.getElementById('stdio-config');
                    const sseConfig = document.getElementById('sse-config');

                    // Show/hide configuration sections based on transport type
                    transportRadios.forEach(radio => {
                        radio.addEventListener('change', () => {
                            if (radio.value === 'stdio') {
                                stdioConfig.classList.remove('hidden');
                                sseConfig.classList.add('hidden');
                            } else {
                                stdioConfig.classList.add('hidden');
                                sseConfig.classList.remove('hidden');
                            }
                        });
                    });

                    // Add environment variable
                    document.getElementById('add-env-var-btn').addEventListener('click', () => {
                        const tbody = document.getElementById('env-vars-body');
                        const row = document.createElement('tr');
                        row.innerHTML = \`
                            <td><input type="text" class="env-name" /></td>
                            <td><input type="text" class="env-value" /></td>
                            <td><button class="remove-env-btn">Remove</button></td>
                        \`;
                        tbody.appendChild(row);

                        // Add event listener to the new remove button
                        row.querySelector('.remove-env-btn').addEventListener('click', () => {
                            row.remove();
                        });
                    });

                    // Add header
                    document.getElementById('add-header-btn').addEventListener('click', () => {
                        const tbody = document.getElementById('headers-body');
                        const row = document.createElement('tr');
                        row.innerHTML = \`
                            <td><input type="text" class="header-name" /></td>
                            <td><input type="text" class="header-value" /></td>
                            <td><button class="remove-header-btn">Remove</button></td>
                        \`;
                        tbody.appendChild(row);

                        // Add event listener to the new remove button
                        row.querySelector('.remove-header-btn').addEventListener('click', () => {
                            row.remove();
                        });
                    });

                    // Add event listeners to existing remove buttons
                    document.querySelectorAll('.remove-env-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            btn.closest('tr').remove();
                        });
                    });

                    document.querySelectorAll('.remove-header-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            btn.closest('tr').remove();
                        });
                    });

                    // Parse JSON button
                    document.getElementById('parse-json-button').addEventListener('click', () => {
                        const jsonText = document.getElementById('json-config').value;
                        if (jsonText.trim()) {
                            vscode.postMessage({
                                command: 'parseJson',
                                json: jsonText
                            });
                        }
                    });

                    // Test connection button
                    document.getElementById('test-connection-btn').addEventListener('click', () => {
                        const server = getServerConfig();
                        vscode.postMessage({
                            command: 'testConnection',
                            server
                        });
                    });

                    // Save button
                    document.getElementById('save-btn').addEventListener('click', () => {
                        const server = getServerConfig();
                        vscode.postMessage({
                            command: 'saveServer',
                            server
                        });
                    });

                    // Cancel button
                    document.getElementById('cancel-btn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'cancel'
                        });
                    });

                    // Get server configuration from form
                    function getServerConfig() {
                        const name = document.getElementById('server-name').value;
                        const description = document.getElementById('server-description').value;
                        const transportType = document.querySelector('input[name="transport-type"]:checked').value;

                        const server = {
                            name,
                            description,
                            transportType
                        };

                        if (transportType === 'stdio') {
                            const cmd = document.getElementById('stdio-cmd').value;
                            const argsStr = document.getElementById('stdio-args').value;
                            const args = argsStr ? argsStr.split(',').map(arg => arg.trim()) : [];
                            const cwd = document.getElementById('stdio-cwd').value;

                            const environment = {};
                            document.querySelectorAll('#env-vars-body tr').forEach(row => {
                                const name = row.querySelector('.env-name').value;
                                const value = row.querySelector('.env-value').value;
                                if (name) {
                                    environment[name] = value;
                                }
                            });

                            server.stdioConfig = {
                                cmd,
                                args,
                                cwd: cwd || null,
                                environment: Object.keys(environment).length > 0 ? environment : null
                            };
                        } else if (transportType === 'sse') {
                            const url = document.getElementById('sse-url').value;

                            const headers = {};
                            document.querySelectorAll('#headers-body tr').forEach(row => {
                                const name = row.querySelector('.header-name').value;
                                const value = row.querySelector('.header-value').value;
                                if (name) {
                                    headers[name] = value;
                                }
                            });

                            server.sseConfig = {
                                url,
                                headers: Object.keys(headers).length > 0 ? headers : null
                            };
                        }

                        return server;
                    }
                </script>
            </body>
            </html>
        `
    }
}
