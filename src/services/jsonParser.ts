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
export function jsonParserParseConfig(jsonString: string): ApiResponse<ServerConfig> {
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
            sseConfig: {
                url: '',
                headers: {},
            },
        }

        // Recursively search for configuration keys
        function processConfigData(data: Record<string, any>, parentKey?: string): void {
            if (!serverConfig || !serverConfig.stdioConfig || !serverConfig.sseConfig) {
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
                    if (!serverConfig.sseConfig) {
                        serverConfig.sseConfig = { url: value }
                    } else {
                        serverConfig.sseConfig.url = value
                    }
                    // switch to sse type
                    serverConfig.transportType = TransportType.SSE
                    // If name is not set, use parent as name
                    if (serverConfig.name === '' && parentKey) {
                        serverConfig.name = parentKey
                    }
                } else if (value === TransportType.SSE || value === TransportType.STDIO) {
                    // any key with sse or stdio is transport type
                    serverConfig.transportType = value
                } else if (key === 'headers') {
                    if (!serverConfig.sseConfig) {
                        serverConfig.sseConfig = { url: '', headers: value }
                    } else {
                        serverConfig.sseConfig.headers = value
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

            // Validate SSE config
            if (serverConfig.transportType === TransportType.SSE) {
                if (!serverConfig.sseConfig?.url) {
                    return {
                        success: false,
                        error: 'SSE configuration must include a "url" key',
                    }
                }

                // Validate URL format
                const urlRegex = /^(http|https):\/\/[a-zA-Z0-9.-]+:[0-9]+\/sse$/
                if (!urlRegex.test(serverConfig.sseConfig.url)) {
                    return {
                        success: false,
                        error: 'Invalid SSE URL format. Expected: http[s]://{host}:{port}/sse',
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
