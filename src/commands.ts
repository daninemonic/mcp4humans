/**
 * Commands module for the MCP4Humans extension
 *
 * This module registers all the commands used by the extension.
 */
import * as vscode from 'vscode'
import { ServerExplorerProvider } from './views/serverExplorerProvider'
import { ServerDetailWebview } from './webviews/serverDetailWebview'
import { ServerConfigForm } from './webviews/serverConfigForm'
import { addServer, updateServer, deleteServer } from './services/storage'
import { connectToServer, disconnectFromServer } from './services/mcpClient'

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
    const refreshCommand = vscode.commands.registerCommand('mcp4humans.refreshServerList', () => {
        serverExplorerProvider.refresh()
    })

    // Register the add server command
    const addServerCommand = vscode.commands.registerCommand('mcp4humans.addServer', () => {
        // Open the server configuration form for adding a new server
        ServerConfigForm.createOrShow(context.extensionUri)
    })

    // Register the edit server command
    const editServerCommand = vscode.commands.registerCommand('mcp4humans.editServer', server => {
        if (server) {
            // Open the server configuration form for editing an existing server
            ServerConfigForm.createOrShow(context.extensionUri, server)
        }
    })

    // Register the delete server command
    const deleteServerCommand = vscode.commands.registerCommand(
        'mcp4humans.deleteServer',
        async server => {
            if (!server) {
                return
            }

            // Make sure it's disconnected
            await disconnectFromServer(server.name)

            // Delete the server
            const response = await deleteServer(context, server.name)

            if (response.success) {
                vscode.commands.executeCommand('mcp4humans.refreshServerList')
            } else {
                vscode.window.showErrorMessage(`Failed to delete server: ${response.error}`)
            }
        }
    )

    // Register the open server detail command
    const openServerDetailCommand = vscode.commands.registerCommand(
        'mcp4humans.openServerDetail',
        server => {
            if (server) {
                // Create or show the server detail webview
                ServerDetailWebview.createOrShow(context.extensionUri, server, false)
            }
        }
    )

    // Register the connect server command
    const connectServerCommand = vscode.commands.registerCommand(
        'mcp4humans.connectServer',
        async server => {
            if (!server) {
                return
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
                    const response = await connectToServer(server)

                    if (response.success) {
                        // Update the server detail webview if it's open
                        if (ServerDetailWebview.currentPanel) {
                            ServerDetailWebview.currentPanel.update(server, true)
                        }

                        // Refresh the server explorer to update the connection status
                        serverExplorerProvider.refresh()
                    } else {
                        vscode.window.showErrorMessage(
                            `Failed to connect to ${server.name}: ${response.error}`
                        )

                        // Update the server detail webview if it's open
                        if (ServerDetailWebview.currentPanel) {
                            ServerDetailWebview.currentPanel.update(server, false)
                        }
                    }
                }
            )
        }
    )

    // Register the disconnect server command
    const disconnectServerCommand = vscode.commands.registerCommand(
        'mcp4humans.disconnectServer',
        async server => {
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
                    const response = await disconnectFromServer(server.name)

                    if (!response.success) {
                        vscode.window.showErrorMessage(
                            `Failed to disconnect from ${server.name}: ${response.error}`
                        )
                    }

                    // Update the server detail webview if it's open
                    if (ServerDetailWebview.currentPanel) {
                        ServerDetailWebview.currentPanel.update(server, false)
                    }

                    // Refresh the server explorer to update the connection status
                    serverExplorerProvider.refresh()
                }
            )
        }
    )

    // Register the save server command
    const saveServerCommand = vscode.commands.registerCommand(
        'mcp4humans.saveServer',
        async (server, isEditing) => {
            let response

            if (isEditing) {
                response = await updateServer(context, server)
            } else {
                response = await addServer(context, server)
            }

            if (response.success) {
                vscode.commands.executeCommand('mcp4humans.refreshServerList')
            } else {
                vscode.window.showErrorMessage(
                    `Failed to ${isEditing ? 'update' : 'add'} server: ${response.error}`
                )
            }
        }
    )

    // Add all commands to subscriptions
    context.subscriptions.push(
        refreshCommand,
        addServerCommand,
        editServerCommand,
        deleteServerCommand,
        openServerDetailCommand,
        connectServerCommand,
        disconnectServerCommand,
        saveServerCommand
    )
}
