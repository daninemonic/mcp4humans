/**
 * JSON Parser for server configurations
 *
 * This module provides functions for parsing JSON configurations into ServerConfig objects.
 */
import { ServerConfig, ApiResponse, TransportType } from '../models/types'

/**
 * Parse a JSON string into a ServerConfig object
 * @param jsonString The JSON string to parse
 * @returns An ApiResponse containing the parsed ServerConfig or an error
 */
export function jsonConfigParser(jsonString: string): ApiResponse<ServerConfig> {
    try {
        const parsedJson = JSON.parse(jsonString)

        // Initialize server config with default values
        const serverConfig: ServerConfig = {
            name: '',
            description: '',
            transportType: TransportType.STDIO,
            stdioConfig: {
                cmd: '',
                args: [],
            },
            httpConfig: {
                url: '',
                headers: {},
            },
        }

        // Recursively search for configuration keys
        function processConfigData(data: Record<string, any>, parentKey?: string): void {
            if (!serverConfig || !serverConfig.stdioConfig || !serverConfig.httpConfig) {
                return
            }
            for (const [key, value] of Object.entries(data)) {
                // We can use fullKey for debugging if needed
                // const fullKey = parentKey ? `${parentKey}.${key}` : key

                if ((key === 'command' || key === 'cmd') && typeof value === 'string') {
                    serverConfig.stdioConfig.cmd = value
                    // If name is not set, use parent of cmd as name
                    if (serverConfig.name === '' && parentKey) {
                        serverConfig.name = parentKey
                    }
                } else if (key === 'cwd') {
                    serverConfig.stdioConfig.cwd = value
                } else if (
                    // command.path is another format for cmd
                    key === 'path' &&
                    parentKey === 'command' &&
                    serverConfig.stdioConfig.cmd === ''
                ) {
                    serverConfig.stdioConfig.cmd = value
                } else if (key === 'arguments' || key === 'args') {
                    serverConfig.stdioConfig.args = value
                } else if (key === 'environment' || key === 'env') {
                    serverConfig.stdioConfig.environment = value
                } else if (key === 'description') {
                    serverConfig.description = value
                } else if (key === 'name') {
                    serverConfig.name = value
                } else if (typeof value === 'string' && value.startsWith('http')) {
                    // value that starts with http should be url
                    if (!serverConfig.httpConfig) {
                        serverConfig.httpConfig = { url: value }
                    } else {
                        serverConfig.httpConfig.url = value
                    }
                    // switch to http type
                    serverConfig.transportType = TransportType.HTTP
                    // If name is not set, use parent as name
                    if (serverConfig.name === '' && parentKey) {
                        serverConfig.name = parentKey
                    }
                } else if (value === TransportType.HTTP || value === TransportType.STDIO) {
                    // any key with http or stdio is transport type
                    serverConfig.transportType = value
                } else if (key === 'headers') {
                    if (!serverConfig.httpConfig) {
                        serverConfig.httpConfig = { url: '', headers: value }
                    } else {
                        serverConfig.httpConfig.headers = value
                    }
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    // Recursively process nested objects
                    processConfigData(value, key)
                }
            }
        }

        // Process the configuration data
        processConfigData(parsedJson)

        // Validate the configuration
        try {
            // Validate STDIO config
            if (serverConfig.transportType === TransportType.STDIO) {
                if (!serverConfig.stdioConfig || !serverConfig.stdioConfig.cmd) {
                    return {
                        success: false,
                        error: 'STDIO configuration must include a "cmd" or "command" key',
                    }
                }
            }

            // Validate HTTP config
            if (serverConfig.transportType === TransportType.HTTP) {
                if (!serverConfig.httpConfig?.url) {
                    return {
                        success: false,
                        error: 'HTTP configuration must include a "url" key',
                    }
                }

                // Validate URL format
                const urlRegex = /^(http|https):\/\/[a-zA-Z0-9.-:]+\/(mcp|sse)$/
                if (!urlRegex.test(serverConfig.httpConfig.url)) {
                    return {
                        success: false,
                        error: 'Invalid HTTP URL format. Expected: (http|https)://.../(mcp|sse)',
                    }
                }
            }

            return {
                success: true,
                data: serverConfig,
            }
        } catch (validationError) {
            return {
                success: false,
                error:
                    validationError instanceof Error
                        ? validationError.message
                        : String(validationError),
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
