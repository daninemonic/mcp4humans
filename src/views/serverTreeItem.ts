/**
 * Server Tree Item
 *
 * This class represents a server in the Server Explorer tree view.
 */
import * as vscode from 'vscode';
import { ServerConfig } from '../models/types';

/**
 * Tree item representing a server in the Server Explorer
 */
export class ServerTreeItem extends vscode.TreeItem {
    /**
     * Constructor
     * @param name The name of the server
     * @param description The description of the server
     * @param transportType The transport type of the server (stdio or sse)
     * @param isConnected Whether the server is connected
     * @param serverConfig The server configuration
     */
    constructor(
        public readonly name: string,
        public readonly serverDescription: string,
        public readonly transportType: string,
        public readonly isConnected: boolean,
        public readonly serverConfig: ServerConfig
    ) {
        super(
            name,
            vscode.TreeItemCollapsibleState.None
        );

        // Set the context value for context menu filtering
        this.contextValue = isConnected ? 'connected' : 'disconnected';

        // Set the description (shown next to the label)
        this.description = `(${transportType})`;

        // Set the tooltip
        this.tooltip = `${name}: ${serverDescription}`;

        // Set the icon based on connection status
        this.iconPath = this.getIconPath();

        // Set the command to execute when the item is clicked
        this.command = {
            command: 'mcp4humans.openServerDetail',
            title: 'Open Server Detail',
            arguments: [serverConfig]
        };
    }

    /**
     * Get the icon based on the connection status
     * @returns The ThemeIcon
     */
    private getIconPath(): vscode.ThemeIcon {
        // Use built-in icons with appropriate colors
        const iconName = this.isConnected ? 'circle-filled' : 'circle-outline';
        const iconColor = this.isConnected ?
            new vscode.ThemeColor('testing.iconPassed') :
            new vscode.ThemeColor('testing.iconQueued');

        return new vscode.ThemeIcon(iconName, iconColor);
    }
}
