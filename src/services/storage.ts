/**
 * Storage utilities for the MCP4Humans extension
 *
 * This module provides functions for storing and retrieving data from VSCode's extension storage.
 */
import * as vscode from 'vscode'
import { ServerConfig, ApiResponse, TransportType } from '../models/types'

/**
 * Storage keys
 */
export enum StorageKeys {
    SERVERS = 'mcp4humans.servers',
}

/**
 * Get all servers from storage
 * @param context The extension context
 * @returns A promise that resolves to an ApiResponse containing the servers
 */
export async function getServers(
    context: vscode.ExtensionContext
): Promise<ApiResponse<ServerConfig[]>> {
    try {
        // Get servers from global state
        const servers = context.globalState.get<ServerConfig[]>(StorageKeys.SERVERS) || []

        return {
            success: true,
            data: servers,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * Add a server to storage
 * @param context The extension context
 * @param server The server to add
 * @returns A promise that resolves to an ApiResponse
 */
export async function addServer(
    context: vscode.ExtensionContext,
    server: ServerConfig
): Promise<ApiResponse<void>> {
    try {
        // Get current servers
        const servers = context.globalState.get<ServerConfig[]>(StorageKeys.SERVERS) || []

        // Check if a server with the same name already exists
        if (servers.some(s => s.name === server.name)) {
            return {
                success: false,
                error: `A server with the name "${server.name}" already exists`,
            }
        }

        // Add the new server
        servers.push(server)

        // Save the updated servers list
        await context.globalState.update(StorageKeys.SERVERS, servers)

        return {
            success: true,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * Update a server in storage
 * @param context The extension context
 * @param server The updated server
 * @param oldName The old name of the server (if the name has changed)
 * @returns A promise that resolves to an ApiResponse
 */
export async function updateServer(
    context: vscode.ExtensionContext,
    server: ServerConfig,
    oldName?: string
): Promise<ApiResponse<void>> {
    try {
        // Get current servers
        const servers = context.globalState.get<ServerConfig[]>(StorageKeys.SERVERS) || []

        // If oldName is provided and different from the new name, check if the new name already exists
        if (oldName && oldName !== server.name) {
            if (servers.some(s => s.name === server.name)) {
                return {
                    success: false,
                    error: `A server with the name "${server.name}" already exists`,
                }
            }
        }

        // Find the server to update
        const serverIndex = oldName
            ? servers.findIndex(s => s.name === oldName)
            : servers.findIndex(s => s.name === server.name)

        if (serverIndex === -1) {
            return {
                success: false,
                error: `Server "${oldName || server.name}" not found`,
            }
        }

        // Update the server
        servers[serverIndex] = server

        // Save the updated servers list
        await context.globalState.update(StorageKeys.SERVERS, servers)

        return {
            success: true,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * Delete a server from storage
 * @param context The extension context
 * @param name The name of the server to delete
 * @returns A promise that resolves to an ApiResponse
 */
export async function deleteServer(
    context: vscode.ExtensionContext,
    name: string
): Promise<ApiResponse<void>> {
    try {
        // Get current servers
        const servers = context.globalState.get<ServerConfig[]>(StorageKeys.SERVERS) || []

        // Find the server to delete
        const serverIndex = servers.findIndex(s => s.name === name)

        if (serverIndex === -1) {
            return {
                success: false,
                error: `Server "${name}" not found`,
            }
        }

        // Remove the server
        servers.splice(serverIndex, 1)

        // Save the updated servers list
        await context.globalState.update(StorageKeys.SERVERS, servers)

        return {
            success: true,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
