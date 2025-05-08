/**
 * Commands module for the MCP4Humans extension
 *
 * This module registers all the commands used by the extension.
 */
import * as vscode from 'vscode'
import { ServerExplorerProvider } from './views/serverExplorerProvider'
import { ServerDetailWebview } from './webviews/serverDetailWebview'
import { ServerConfigForm } from './webviews/serverConfigForm'
import { storageServerAdd, storageUpdateServer, storageDeleteServer } from './services/storage'
import { ServerConfig, ServerSchema } from './models/types'
import { mcpConnect, mcpDisconnect, mcpIsServerConnected, mcpGetTools } from './services/mcpClient'

// Enum to define mcp4humans commands list
export enum MCP4HumansCommand {
    ServerTreeRefresh = 'mcp4humans.serverTreeRefresh',
    ServerViewAdd = 'mcp4humans.serverViewAdd',
    ServerViewEdit = 'mcp4humans.serverViewEdit',
    StorageDeleteServer = 'mcp4humans.storageDeleteServer',
    MCPConnect = 'mcp4humans.mcpConnect',
    MCPDisconnect = 'mcp4humans.mcpDisconnect',
    StorageSaveServer = 'mcp4humans.storageSaveServer',
    ServerViewDetail = 'mcp4humans.serverViewDetail',
}

/**
 * Registers all commands for the extension
 * @param context The extension context
 * @param serverExplorerProvider The server explorer provider
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    serverExplorerProvider: ServerExplorerProvider
): void {
    // Register the refresh command
    const ServerTreeRefreshCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.ServerTreeRefresh,
        () => {
            serverExplorerProvider.refresh()
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
            const response = await storageDeleteServer(context, serverName)

            if (response.success) {
                vscServerTreeRefresh()
            } else {
                vscode.window.showErrorMessage(`Failed to delete server: ${response.error}`)
            }
        }
    )

    // Register the open server detail command
    const ServerViewDetailCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.ServerViewDetail,
        (server: ServerSchema) => {
            if (server) {
                // Create or show the server detail webview
                ServerDetailWebview.createOrShow(
                    context.extensionUri,
                    server,
                    mcpIsServerConnected(server.name)
                )
            }
        }
    )

    // Register the connect server command
    const MCPConnectCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.MCPConnect,
        async (server: ServerConfig) => {
            if (!server) {
                return
            }
            let isConnected = false
            const schema: ServerSchema = {
                ...server,
                tools: [],
            }

            // Show progress notification
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Connecting to ${server.name}...`,
                    cancellable: false,
                },
                async () => {
                    // Connect to the server
                    const connectResponse = await mcpConnect(server)

                    if (!connectResponse.success) {
                        vscode.window.showErrorMessage(
                            `Failed to connect to ${server.name}: ${connectResponse.error}`
                        )
                    } else {
                        // Get tools
                        const toolsResponse = await mcpGetTools(server.name)
                        if (!toolsResponse.success && toolsResponse.data) {
                            vscode.window.showErrorMessage(
                                `Failed to get tools from ${server.name}: ${connectResponse.error}`
                            )
                            // Leave it in disconnected state
                            await mcpDisconnect(server.name)
                        } else {
                            schema.tools = toolsResponse.data!
                            isConnected = true

                            // Update the server schema in storage
                            vscStorageSaveServer(schema, false)

                            // Refresh the server explorer to update the connection status
                            serverExplorerProvider.refresh()
                        }
                    }

                    // Update thes server detail webview if it exists
                    const serverPanel = ServerDetailWebview.getPanel(server.name)
                    if (serverPanel) {
                        serverPanel.update(schema, isConnected)
                    }
                }
            )
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
                        serverPanel.update({ ...server, tools: [] } as ServerSchema, false)
                    }

                    // Refresh the server explorer to update the connection status
                    serverExplorerProvider.refresh()
                }
            )
        }
    )

    // Register the save server command
    const StorageSaveServerCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.StorageSaveServer,
        async (schema: ServerSchema, isNew: boolean) => {
            let response

            if (isNew) {
                response = await storageServerAdd(context, schema)
            } else {
                response = await storageUpdateServer(context, schema)
            }

            if (response.success) {
                vscServerTreeRefresh()
            } else {
                vscode.window.showErrorMessage(
                    `Failed to ${isNew ? 'add' : 'update'} server: ${response.error}`
                )
            }
        }
    )

    // Add all commands to subscriptions
    context.subscriptions.push(
        ServerTreeRefreshCommand,
        ServerViewAddCommand,
        ServerViewEditCommand,
        StorageDeleteServerCommand,
        ServerViewDetailCommand,
        MCPConnectCommand,
        MCPDisconnectCommand,
        StorageSaveServerCommand
    )
}

// Create typed interfaces:
export const vscServerTreeRefresh = () => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerTreeRefresh)
}

export const vscServerViewAdd = () => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerViewAdd)
}

export const vscServerViewEdit = (server: ServerSchema) => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerViewEdit, server)
}

export const vscServerViewDetail = (server: ServerSchema) => {
    vscode.commands.executeCommand(MCP4HumansCommand.ServerViewDetail, server)
}

export const vscMCPConnect = (server: ServerConfig) => {
    vscode.commands.executeCommand(MCP4HumansCommand.MCPConnect, server)
}

export const vscMCPDisconnect = (server: ServerConfig) => {
    vscode.commands.executeCommand(MCP4HumansCommand.MCPDisconnect, server)
}

export const vscStorageSaveServer = (schema: ServerSchema, isNew: boolean) => {
    vscode.commands.executeCommand(MCP4HumansCommand.StorageSaveServer, schema, isNew)
}

export const vscStorageDeleteServer = (serverName: string) => {
    vscode.commands.executeCommand(MCP4HumansCommand.StorageDeleteServer, serverName)
}
