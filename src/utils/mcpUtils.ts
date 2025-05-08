/**
 * MCP Utilities
 *
 * Provides a reusable middleware for mcp+vscode interface
 */
import * as vscode from 'vscode'
import { ServerConfig, ServerSchema } from '../models/types'
import { mcpConnect, mcpDisconnect, mcpGetTools } from '../services/mcpClient'
import { vscStorageAddServer, vscStorageUpdateServer, vscServerTreeRefresh } from '../commands'

export async function mcpConnectAndBuildSchema(
    server: ServerConfig,
    isNew: boolean
): Promise<ServerSchema | undefined> {
    return vscode.window.withProgress(
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
                return
            }

            // Get tools
            const toolsResponse = await mcpGetTools(server.name)
            if (!toolsResponse.success || !toolsResponse.data) {
                // Ensure it's disconnected
                await mcpDisconnect(server.name)
                vscode.window.showErrorMessage(
                    `Failed to get tools from ${server.name}: ${toolsResponse.error}`
                )
                return
            }

            // Build the server schema
            const schema: ServerSchema = {
                ...server,
                tools: toolsResponse.data,
            }

            // Update storage
            if (isNew) {
                await vscStorageAddServer(schema)
            } else {
                await vscStorageUpdateServer(schema)
            }

            // Refresh the server explorer to update the connection status
            vscServerTreeRefresh()

            return schema
        }
    )
}
