/**
 * Storage utilities for the MCP4Humans extension
 *
 * This module provides functions for storing and retrieving data from VSCode's extension storage.
 */
import * as vscode from 'vscode'
import { ServerSchema, ApiResponse } from '../models/types'

/**
 * Storage keys
 */
export enum StorageKeys {
    SERVERS = 'mcp4humans.servers',
}

export class StorageService {
    private context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext) {
        this.context = context
    }

    /**
     * Returns whether a server name already exists
     * @param serverName Name to verify
     * @returns A promise that resolves to an ApiResponse containing the result
     */
    public async serverExists(serverName: string): Promise<ApiResponse<boolean>> {
        try {
            const servers = this.context.globalState.get<ServerSchema[]>(StorageKeys.SERVERS) || []

            const exists = servers.some(s => s.name === serverName)

            return {
                success: true,
                data: exists,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    /**
     * Get all servers from storage
     * @returns An array of ServerSchema
     */
    public getServers(): ServerSchema[] {
        // Get servers from global state and return directly
        return this.context.globalState.get<ServerSchema[]>(StorageKeys.SERVERS) || []
    }

    /**
     * Add a server to storage
     * @param schema The server schema to add
     * @returns A promise that resolves to an ApiResponse
     */
    public async addServer(schema: ServerSchema): Promise<ApiResponse<void>> {
        try {
            // Get current servers
            const servers = this.getServers()

            // Check if a server with the same name already exists
            if (servers.some(s => s.name === schema.name)) {
                return {
                    success: false,
                    error: `A server with the name "${schema.name}" already exists`,
                }
            }

            // Add the new server
            servers.push(schema)

            // Save the updated servers list
            await this.context.globalState.update(StorageKeys.SERVERS, servers)

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
     * @param schema The updated server schema
     * @param oldName The old name of the server (if the name has changed)
     * @returns A promise that resolves to an ApiResponse
     */
    public async updateServer(schema: ServerSchema, oldName?: string): Promise<ApiResponse<void>> {
        try {
            // Get current servers
            const servers = this.getServers()

            // If oldName is provided and different from the new name, check if the new name already exists
            if (oldName && oldName !== schema.name) {
                if (servers.some(s => s.name === schema.name)) {
                    return {
                        success: false,
                        error: `A server with the name "${schema.name}" already exists`,
                    }
                }
            }

            // Find the server to update
            const serverIndex = oldName
                ? servers.findIndex(s => s.name === oldName)
                : servers.findIndex(s => s.name === schema.name)

            if (serverIndex === -1) {
                return {
                    success: false,
                    error: `Server "${oldName || schema.name}" not found`,
                }
            }

            // Update the server
            servers[serverIndex] = schema

            // Save the updated servers list
            await this.context.globalState.update(StorageKeys.SERVERS, servers)

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
     * @param name The name of the server to delete
     * @returns A promise that resolves to an ApiResponse
     */
    public async deleteServer(name: string): Promise<ApiResponse<void>> {
        try {
            // Get current servers
            const servers = this.getServers()

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
            await this.context.globalState.update(StorageKeys.SERVERS, servers)

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
}
