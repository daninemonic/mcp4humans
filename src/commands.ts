/**
 * Commands module for the MCP4Humans extension
 *
 * This module registers all the commands used by the extension.
 */
import * as vscode from 'vscode'
import { ServerListProvider } from './webviews/server/serverList'
import { ServerDetailWebview } from './webviews/server/serverView'
import { ServerConfigForm } from './webviews/server/editSettings'
import { StorageService } from './services/storage'
import { ServerConfig, ServerSchema, ApiResponse, ServerStatus } from './models/types'
import { MCP4HumansCommand, MCPConnectType } from './models/commands'
import { mcpConnect, mcpDisconnect, mcpIsServerConnected, mcpGetTools } from './services/mcpClient'
import { LogService } from './services/logService'

/**
 * Registers all commands for the extension
 * @param context The extension context
 * @param serverListProvider The server buttons webview provider
 * @param storageService The storage service instance
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    serverListProvider: ServerListProvider,
    storageService: StorageService // Accept StorageService instance
): void {
    // Register the log server command
    const LogServerAddCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.LogServerAdd,
        (serverName: string, message: string, rawData?: string, isError: boolean = false) => {
            // Add the log entry to the log service
            LogService.getInstance().addLog(serverName, message, rawData, isError)
        }
    )

    // Register the connect server command
    const MCPConnectCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.MCPConnect,
        async (
            config: ServerConfig,
            connectType: MCPConnectType,
            originalName?: string
        ): Promise<ApiResponse<void>> => {
            if (!config) {
                return apiError('Invalid server config')
            }

            const validateResponse = await validateMCPConnectInputs(
                storageService,
                connectType,
                config.name,
                originalName
            )
            if (!validateResponse.success) {
                return apiError(validateResponse.error!)
            }

            // Connect to the server
            const connectResponse = await mcpConnect(config)
            if (!connectResponse.success) {
                return apiError(`Failed to connect to ${config.name}: ${connectResponse.error}`)
            }

            // Get tools
            const toolsResponse = await mcpGetTools(config.name)
            if (!toolsResponse.success || !toolsResponse.data) {
                // Ensure it's disconnected
                await mcpDisconnect(config.name)
                return apiError(`Failed to get tools from ${config.name}: ${toolsResponse.error}`)
            }

            vscode.window.showInformationMessage(`Connected to ${config.name}`)

            // Build the server schema
            const schema: ServerSchema = {
                ...config,
                status: ServerStatus.CONNECTED,
                tools: toolsResponse.data,
            }

            // Update storage
            if (connectType === MCPConnectType.NEW) {
                await storageService.addServer(schema)
            } else {
                await storageService.updateServer(schema, originalName)
            }

            // Refresh the server list in the webview
            serverListProvider.updateServerList()

            // Open detail window to show it's configured and connected
            ServerDetailWebview.createOrShow(
                context.extensionUri,
                schema,
                mcpIsServerConnected(schema.name)
            )

            return {
                success: true,
            }
        }
    )

    // Register the disconnect server command
    const MCPDisconnectCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.MCPDisconnect,
        async (server: ServerConfig) => {
            if (!server) {
                return
            }

            // Show progress notification
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Disconnecting from ${server.name}...`,
                    cancellable: false,
                },
                async () => {
                    // Disconnect from the server
                    const response = await mcpDisconnect(server.name)

                    if (!response.success) {
                        vscode.window.showErrorMessage(
                            `Failed to disconnect from ${server.name}: ${response.error}`
                        )
                    }

                    // Update the server detail webview if it's open
                    const serverPanel = ServerDetailWebview.getPanel(server.name)
                    if (serverPanel) {
                        serverPanel.update(
                            {
                                ...server,
                                status: ServerStatus.DISCONNECTED,
                                tools: [],
                            } as ServerSchema,
                            false
                        )
                    }

                    // Refresh the server list in the webview
                    serverListProvider.updateServerList()
                }
            )
        }
    )

    // Register the refresh command
    const ServerTreeRefreshCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.ServerTreeRefresh,
        () => {
            serverListProvider.updateServerList()
        }
    )

    // Register the add server command
    const ServerViewAddCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.ServerViewAdd,
        () => {
            // Open the server configuration form for adding a new server
            ServerConfigForm.createOrShow(context.extensionUri)
        }
    )

    // Register the open server detail command
    const ServerViewDetailCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.ServerViewDetail,
        (schema: ServerSchema) => {
            if (schema) {
                // Create or show the server detail webview
                ServerDetailWebview.createOrShow(
                    context.extensionUri,
                    schema,
                    mcpIsServerConnected(schema.name)
                )
            }
        }
    )

    // Register the edit server command
    const ServerViewEditCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.ServerViewEdit,
        server => {
            if (server) {
                // Open the server configuration form for editing an existing server
                ServerConfigForm.createOrShow(context.extensionUri, server)
            }
        }
    )

    // Register the add server command
    const StorageAddServerCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.StorageAddServer,
        async (schema: ServerSchema) => {
            const response = await storageService.addServer(schema)
            if (response.success) {
                serverListProvider.updateServerList()
            } else {
                vscode.window.showErrorMessage(`Failed to add server: ${response.error}`)
            }
        }
    )

    // Register the delete server command
    const StorageDeleteServerCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.StorageDeleteServer,
        async (serverName: string) => {
            if (!serverName) {
                return
            }

            // Make sure it's disconnected
            await mcpDisconnect(serverName)

            // Delete the server
            const response = await storageService.deleteServer(serverName)

            if (response.success) {
                serverListProvider.updateServerList()
            } else {
                vscode.window.showErrorMessage(`Failed to delete server: ${response.error}`)
            }
        }
    )

    // Register the update server command
    const StorageUpdateServerCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.StorageUpdateServer,
        async (schema: ServerSchema, oldName?: string) => {
            const response = await storageService.updateServer(schema, oldName)
            if (response.success) {
                serverListProvider.updateServerList()
            } else {
                vscode.window.showErrorMessage(`Failed to update server: ${response.error}`)
            }
        }
    )

    // Add all commands to subscriptions
    context.subscriptions.push(
        LogServerAddCommand,
        MCPConnectCommand,
        MCPDisconnectCommand,
        ServerTreeRefreshCommand,
        ServerViewAddCommand,
        ServerViewEditCommand,
        ServerViewDetailCommand,
        StorageAddServerCommand,
        StorageUpdateServerCommand,
        StorageDeleteServerCommand
    )
}

/**
 * Helper to print error and return
 */
function apiError(msg: string): ApiResponse<void> {
    vscode.window.showErrorMessage(msg)
    return {
        success: false,
        error: msg,
    }
}

/**
 * Helper to validate the inputs for MCPConnect before trying to connect
 * @param storageService The storage service instance
 */
const validateMCPConnectInputs = async (
    storageService: StorageService,
    connectType: MCPConnectType,
    serverName: string,
    originalServerName?: string
): Promise<ApiResponse<void>> => {
    const existsResponse = await storageService.serverExists(serverName)
    if (!existsResponse.success) {
        return { success: false, error: existsResponse.error }
    }
    const nameExists = existsResponse.data as boolean

    switch (connectType) {
        case MCPConnectType.NEW:
            if (nameExists) {
                return {
                    success: false,
                    error: `Can't create server name ${serverName}. Already exists`,
                }
            }
            break
        case MCPConnectType.UPDATED:
            if (!nameExists) {
                return {
                    success: false,
                    error: `Can't update server name ${serverName}. Doesn't exist`,
                }
            }
            break
        case MCPConnectType.UPDATED_NAME:
            if (nameExists) {
                return {
                    success: false,
                    error: `Can't update server name ${serverName}. Already exists`,
                }
            }
            if (!originalServerName) {
                return {
                    success: false,
                    error: `Original server name required to change server name`,
                }
            }
            break
        case MCPConnectType.EXISTING:
            if (!nameExists) {
                return {
                    success: false,
                    error: `Unexpected error: ${serverName} doesn't exist`,
                }
            }
            break
    }

    return { success: true }
}
