/**
 * Server Tree Item
 *
 * This class represents a server in the Server Explorer tree view.
 */
import * as vscode from 'vscode'
import { ServerSchema } from '../models/types'
import { MCP4HumansCommand } from '../models/commands'

/**
 * Tree item representing a server in the Server Explorer
 */
export class ServerTreeItem extends vscode.TreeItem {
    /**
     * Constructor
     * @param name The name of the server
     * @param description The description of the server
     * @param transportType The transport type of the server (stdio or http)
     * @param isConnected Whether the server is connected
     * @param schema The server schema
     */
    constructor(
        public readonly name: string,
        public readonly serverDescription: string,
        public readonly transportType: string,
        public readonly isConnected: boolean,
        public readonly schema: ServerSchema
    ) {
        super(name, vscode.TreeItemCollapsibleState.None)

        // Set the context value for context menu filtering
        this.contextValue = isConnected ? 'connected' : 'disconnected'

        // Set the description (shown next to the label)
        this.description = `(${transportType})`

        // Set the tooltip
        this.tooltip = `${name}: ${serverDescription}`

        // Set the icon based on connection status
        this.iconPath = this.getIconPath()

        // Set the command to execute when the item is clicked
        this.command = {
            command: MCP4HumansCommand.ServerViewDetail,
            title: 'Open Server Detail',
            arguments: [schema],
        }
    }

    /**
     * Get the icon based on the connection status
     * @returns The ThemeIcon
     */
    private getIconPath(): vscode.ThemeIcon {
        // Use built-in icons with appropriate colors
        const iconName = this.isConnected ? 'circle-filled' : 'circle-outline'
        const iconColor = this.isConnected
            ? new vscode.ThemeColor('testing.iconPassed')
            : new vscode.ThemeColor('testing.iconQueued')

        return new vscode.ThemeIcon(iconName, iconColor)
    }
}
