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
import { MCP4HumansCommand, vscLogServerAdd, vscServerTreeRefresh } from './models/commands'
import { mcpDisconnect, mcpIsServerConnected } from './services/mcpClient'
import { mcpConnectAndBuildSchema } from './utils/mcpUtils'
import { LogService } from './services/logService'

/**
 * Registers all commands for the extension
 * @param context The extension context
 * @param serverExplorerProvider The server explorer provider
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    serverExplorerProvider: ServerExplorerProvider
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
        async (server: ServerConfig) => {
            if (!server) {
                return
            }
            const schema = await mcpConnectAndBuildSchema(server, false)

            // Update the server detail webview if it exists
            const serverPanel = ServerDetailWebview.getPanel(server.name)
            if (serverPanel) {
                serverPanel.update(schema || ({ ...server, tools: [] } as ServerSchema), !!schema)
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
                        serverPanel.update({ ...server, tools: [] } as ServerSchema, false)
                    }

                    // Refresh the server explorer to update the connection status
                    serverExplorerProvider.refresh()
                }
            )
        }
    )

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
            const response = await storageServerAdd(context, schema)
            if (response.success) {
                vscServerTreeRefresh()
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
            const response = await storageDeleteServer(context, serverName)

            if (response.success) {
                vscServerTreeRefresh()
            } else {
                vscode.window.showErrorMessage(`Failed to delete server: ${response.error}`)
            }
        }
    )

    // Register the update server command
    const StorageUpdateServerCommand = vscode.commands.registerCommand(
        MCP4HumansCommand.StorageUpdateServer,
        async (schema: ServerSchema) => {
            const response = await storageUpdateServer(context, schema)
            if (response.success) {
                vscServerTreeRefresh()
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
