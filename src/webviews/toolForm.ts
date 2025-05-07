/**
 * Tool Form Component
 *
 * This module provides a webview panel for displaying and interacting with MCP tools.
 */
import * as vscode from 'vscode'
import { Tool, ToolParameter, ToolParameterType } from '../models/types'
import { executeTool } from '../services/mcpClient'
import { getWebviewContent } from '../utils/webviewUtils'

/**
 * Result display state
 */
enum ResultDisplayState {
    COLLAPSED,
    OPENED,
    FULL,
}

/**
 * Tool execution state
 */
enum ToolExecutionState {
    IDLE,
    EXECUTING,
    SUCCESS,
    ERROR,
}

/**
 * Tool execution result
 */
interface ToolExecutionResult {
    success: boolean
    data?: any
    error?: string
}

/**
 * Class that manages the tool form webview panel
 */
export class ToolForm {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: ToolForm | undefined

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []
    private _tool: Tool
    private _serverName: string
    private _executionState: ToolExecutionState = ToolExecutionState.IDLE
    private _resultDisplayState: ResultDisplayState = ResultDisplayState.COLLAPSED
    private _result: ToolExecutionResult | undefined
    private _validationErrors: Record<string, string> = {}

    /**
     * Get the static view type for the webview panel
     */
    public static readonly viewType = 'mcp4humans.toolForm'

    /**
     * Create or show a tool form panel
     * @param extensionUri The URI of the extension
     * @param tool The tool to display
     * @param serverName The name of the server
     */
    public static createOrShow(extensionUri: vscode.Uri, tool: Tool, serverName: string): ToolForm {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        // If we already have a panel, show it
        if (ToolForm.currentPanel) {
            ToolForm.currentPanel._panel.reveal(column)
            ToolForm.currentPanel._tool = tool
            ToolForm.currentPanel._serverName = serverName
            ToolForm.currentPanel._update()
            return ToolForm.currentPanel
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ToolForm.viewType,
            `Tool: ${tool.name}`,
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

        ToolForm.currentPanel = new ToolForm(panel, extensionUri, tool, serverName)
        return ToolForm.currentPanel
    }

    /**
     * Constructor
     * @param panel The webview panel
     * @param extensionUri The URI of the extension
     * @param tool The tool to display
     * @param serverName The name of the server
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        tool: Tool,
        serverName: string
    ) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._tool = tool
        this._serverName = serverName

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
                    case 'executeTool':
                        await this._handleExecuteTool(message.toolName, message.parameters)
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
        ToolForm.currentPanel = undefined

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
     * Handle executing the tool
     * @param toolName The name of the tool to execute
     * @param parameters The parameters for the tool
     */
    private async _handleExecuteTool(
        toolName: string,
        parameters: Record<string, any>
    ): Promise<void> {
        // Validate parameters
        const validationErrors = this._validateParameters(parameters)
        if (Object.keys(validationErrors).length > 0) {
            this._validationErrors = validationErrors
            this._update()
            return
        }

        // Set executing state
        this._executionState = ToolExecutionState.EXECUTING
        this._update()

        try {
            // Execute the tool
            const response = await executeTool(this._serverName, toolName, parameters)

            if (response.success) {
                this._executionState = ToolExecutionState.SUCCESS
                this._result = {
                    success: true,
                    data: response.data,
                }
            } else {
                this._executionState = ToolExecutionState.ERROR
                this._result = {
                    success: false,
                    error: response.error,
                }
            }

            // Show the result
            this._resultDisplayState = ResultDisplayState.COLLAPSED
            this._update()
        } catch (error) {
            this._executionState = ToolExecutionState.ERROR
            this._result = {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
            this._resultDisplayState = ResultDisplayState.COLLAPSED
            this._update()
        }
    }

    /**
     * Validate the parameters
     * @param parameters The parameters to validate
     * @returns Validation errors
     */
    private _validateParameters(parameters: Record<string, any>): Record<string, string> {
        const errors: Record<string, string> = {}

        if (!this._tool.parameters) {
            return errors
        }

        for (const param of this._tool.parameters) {
            const value = parameters[param.name]

            // Check required parameters
            if (param.required && (value === undefined || value === null || value === '')) {
                errors[param.name] = `${param.name} is required`
                continue
            }

            // Skip validation for empty optional parameters
            if (!param.required && (value === undefined || value === null || value === '')) {
                continue
            }

            // Validate parameter types
            switch (param.type) {
                case ToolParameterType.STRING:
                    if (typeof value !== 'string') {
                        errors[param.name] = `${param.name} must be a string`
                    }
                    break
                case ToolParameterType.NUMBER:
                    if (typeof value !== 'number' || isNaN(value)) {
                        errors[param.name] = `${param.name} must be a number`
                    }
                    break
                case ToolParameterType.BOOLEAN:
                    if (typeof value !== 'boolean') {
                        errors[param.name] = `${param.name} must be a boolean`
                    }
                    break
                case ToolParameterType.OBJECT:
                    try {
                        if (typeof value === 'string') {
                            JSON.parse(value)
                        } else if (typeof value !== 'object') {
                            throw new Error('Not an object')
                        }
                    } catch (error) {
                        errors[param.name] = `${param.name} must be a valid JSON object`
                    }
                    break
                case ToolParameterType.ARRAY:
                    try {
                        if (typeof value === 'string') {
                            const parsed = JSON.parse(value)
                            if (!Array.isArray(parsed)) {
                                throw new Error('Not an array')
                            }
                        } else if (!Array.isArray(value)) {
                            throw new Error('Not an array')
                        }
                    } catch (error) {
                        errors[param.name] = `${param.name} must be a valid JSON array`
                    }
                    break
            }
        }

        return errors
    }

    /**
     * Update the webview content
     */
    private _update(): void {
        this._panel.title = `Tool: ${this._tool.name}`
        this._panel.webview.html = this._getHtmlForWebview()
    }

    /**
     * Get the HTML for the webview
     * @returns The HTML for the webview
     */
    private _getHtmlForWebview(): string {
        // Generate parameter inputs
        const parameterInputs = this._generateParameterInputs()

        // Prepare result content
        let resultContainerClass = 'hidden'
        let resultStatusClass = ''
        let resultStatusIcon = ''
        let resultStatusText = ''
        let resultToggleClass = ''
        let resultContentClass = ''
        let truncatedResultText = ''
        let fullResultText = ''
        let showMoreButtonClass = 'hidden'
        let showMoreButtonText = ''

        if (this._result) {
            resultContainerClass = ''

            if (this._result.success) {
                resultStatusClass = 'success'
                resultStatusIcon = '✓'
                resultStatusText = 'Success'
            } else {
                resultStatusClass = 'error'
                resultStatusIcon = '✗'
                resultStatusText = 'Error'
            }

            // Format the result as JSON
            const resultJson = JSON.stringify(
                this._result.success ? this._result.data : { error: this._result.error },
                null,
                2
            )
            fullResultText = resultJson

            // Truncate the result for collapsed view
            const resultLines = resultJson.split('\n')
            truncatedResultText = resultLines.slice(0, 5).join('\n')

            if (resultLines.length > 5) {
                showMoreButtonClass = ''
                showMoreButtonText = 'Show more'
            } else {
                showMoreButtonClass = 'hidden'
            }

            // Set result display state
            if (
                this._resultDisplayState === ResultDisplayState.OPENED ||
                this._resultDisplayState === ResultDisplayState.FULL
            ) {
                resultToggleClass = 'open'
                resultContentClass = 'open'

                if (this._resultDisplayState === ResultDisplayState.FULL) {
                    showMoreButtonText = 'Show less'
                }
            }
        }

        // Prepare replacements for the template
        const replacements: Record<string, string> = {
            toolName: this._tool.name,
            toolDescription: this._tool.description || '',
            parameterInputs: parameterInputs,
            resultContainerClass: resultContainerClass,
            resultStatusClass: resultStatusClass,
            resultStatusIcon: resultStatusIcon,
            resultStatusText: resultStatusText,
            resultToggleClass: resultToggleClass,
            resultContentClass: resultContentClass,
            resultText:
                this._resultDisplayState === ResultDisplayState.FULL
                    ? fullResultText
                    : truncatedResultText,
            truncatedResultText: truncatedResultText,
            fullResultText: fullResultText,
            showMoreButtonClass: showMoreButtonClass,
            showMoreButtonText: showMoreButtonText,
        }

        // Get the HTML content using the template
        return getWebviewContent(
            this._panel.webview,
            this._extensionUri,
            'src/webviews/templates/toolForm.html',
            replacements
        )
    }

    /**
     * Generate HTML for parameter inputs
     * @returns HTML for parameter inputs
     */
    private _generateParameterInputs(): string {
        if (!this._tool.parameters || this._tool.parameters.length === 0) {
            return '<p>This tool has no parameters.</p>'
        }

        return this._tool.parameters
            .map(param => {
                const required = param.required ? '<span class="required-indicator">*</span>' : ''
                const error = this._validationErrors[param.name]
                    ? `<div class="parameter-error">${this._validationErrors[param.name]}</div>`
                    : ''

                let input = ''

                switch (param.type) {
                    case ToolParameterType.STRING:
                        input = `<input type="text" id="${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" value="${param.default || ''}" />`
                        break
                    case ToolParameterType.NUMBER:
                        input = `<input type="number" id="${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" value="${param.default || ''}" />`
                        break
                    case ToolParameterType.BOOLEAN:
                        input = `<input type="checkbox" id="${param.name}" name="${param.name}" data-parameter="${param.name}" ${param.default ? 'checked' : ''} />`
                        break
                    case ToolParameterType.OBJECT:
                        input = `<textarea id="${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" rows="5" placeholder="{}">${param.default || ''}</textarea>`
                        break
                    case ToolParameterType.ARRAY:
                        input = `<textarea id="${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" rows="5" placeholder="[]">${param.default || ''}</textarea>`
                        break
                    default:
                        input = `<input type="text" id="${param.name}" name="${param.name}" class="parameter-input" data-parameter="${param.name}" />`
                }

                return `
                <div class="parameter-group">
                    <label for="${param.name}" class="parameter-label">${param.name}${required}</label>
                    ${param.description ? `<div class="parameter-description">${param.description}</div>` : ''}
                    ${input}
                    ${error}
                </div>
            `
            })
            .join('')
    }
}
