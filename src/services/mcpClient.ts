/**
 * MCP Client utilities for the MCP4Humans extension
 *
 * This module provides functions for interacting with MCP servers.
 */
import { ServerConfig, Tool, ApiResponse, ToolParameterType, TransportType } from '../models/types'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

// Store active client connections
const activeClients: Record<string, Client> = {}

/**
 * Check if a server is connected
 * @param serverName The name of the server
 * @returns True if the server is connected, false otherwise
 */
export function isServerConnected(serverName: string): boolean {
    return !!activeClients[serverName]
}

/**
 * Connect to an MCP server
 * @param server The server configuration
 * @returns A promise that resolves to an ApiResponse
 */
export async function connectToServer(server: ServerConfig): Promise<ApiResponse<void>> {
    try {
        console.log('Connecting to server:', server.name)
        console.log('Transport type:', server.transportType)

        // Create client identity
        const clientIdentity = {
            name: `mcp4humans-vscode-client-for-${server.name}`,
            version: '1.0.0',
        }

        // Define client capabilities
        const clientCapabilities = {
            tools: {
                list: true,
                call: true,
            },
            resources: {
                list: true,
                read: true,
                templates: {
                    list: true,
                },
            },
            prompts: {
                list: true,
                get: true,
            },
            logging: {
                setLevel: true,
            },
            roots: {
                listChanged: true,
            },
        }

        // Create client instance
        const client = new Client(clientIdentity, {
            capabilities: clientCapabilities,
        })

        // Create transport based on configuration
        let transport
        if (server.transportType === TransportType.STDIO) {
            if (!server.stdioConfig) {
                return {
                    success: false,
                    error: 'STDIO configuration is missing',
                }
            }

            // Create environment variables object if needed
            let env: Record<string, string> = {}

            // Include the system PATH to ensure commands can be found
            if (process.env.PATH) {
                env.PATH = process.env.PATH
            }

            // Add user-specified environment variables
            if (server.stdioConfig.environment) {
                env = {
                    ...env,
                    ...server.stdioConfig.environment,
                }
            }

            // Create STDIO transport
            console.log('Creating STDIO transport with command:', server.stdioConfig.cmd)
            console.log('Arguments:', server.stdioConfig.args)
            console.log('CWD:', server.stdioConfig.cwd)

            // Handle special cases for common commands
            let command = server.stdioConfig.cmd
            let args = [...(server.stdioConfig.args || [])]
            let cwd = server.stdioConfig.cwd || undefined

            // Special handling for uv command
            if (command === 'uv' && cwd) {
                // For uv, we need to use the --directory argument
                if (!args.includes('--directory') && !args.includes('-d')) {
                    args = ['--directory', cwd, ...args]
                }
                // When using --directory, we don't need to set cwd
                cwd = undefined
            }

            // Special handling for python/python3 commands
            // For python, we keep the cwd as is, as it's passed directly to StdioClientTransport

            transport = new StdioClientTransport({
                command: command,
                args: args,
                cwd: cwd,
                env,
                stderr: 'pipe', // Capture stderr for better error reporting
            })
        } else if (server.transportType === TransportType.SSE) {
            if (!server.sseConfig?.url) {
                return {
                    success: false,
                    error: 'SSE configuration must include a URL',
                }
            }

            console.log('Connecting to SSE server:', server.sseConfig.url)

            // Create SSE transport
            const sseUrl = new URL(server.sseConfig.url)

            // Create SSE transport with appropriate options
            transport = new SSEClientTransport(sseUrl, {
                // Add headers if provided
                ...(server.sseConfig.headers && {
                    requestInit: {
                        headers: server.sseConfig.headers,
                    },
                }),
            })
        } else {
            return {
                success: false,
                error: `Unsupported transport type: ${server.transportType}`,
            }
        }

        // Set up error handling for stderr if available (for STDIO transport)
        if (server.transportType === TransportType.STDIO) {
            const stdioTransport = transport as StdioClientTransport

            // Start the transport to get access to stderr
            await stdioTransport.start()

            // Access the stderr stream if available
            if (stdioTransport.stderr) {
                stdioTransport.stderr.on('data', (data: Buffer) => {
                    const output = data.toString()
                    console.log(`Server "${server.name}" stderr:`, output)
                })
            }

            // Monkey-patch the start method to prevent it from being called again during connect
            stdioTransport.start = async () => {}
        }

        // Connect to the server
        console.log('Connecting to MCP server:', server.name)
        await client.connect(transport, { timeout: 5000 })
        console.log('Connected to MCP server:', server.name)

        // Store the client for later use
        activeClients[server.name] = client

        return {
            success: true,
        }
    } catch (error) {
        console.error('Failed to connect to server:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * Disconnect from an MCP server
 * @param serverName The name of the server
 * @returns A promise that resolves to an ApiResponse
 */
export async function disconnectFromServer(serverName: string): Promise<ApiResponse<void>> {
    try {
        const client = activeClients[serverName]
        if (!client) {
            return {
                success: false,
                error: `No active connection for server: ${serverName}`,
            }
        }

        await client.close()
        delete activeClients[serverName]

        return {
            success: true,
        }
    } catch (error) {
        console.error(`Failed to disconnect from server ${serverName}:`, error)
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * Get the list of tools from an MCP server
 * @param serverName The name of the server
 * @returns A promise that resolves to an ApiResponse containing the tools
 */
export async function getToolsList(serverName: string): Promise<ApiResponse<Tool[]>> {
    try {
        const client = activeClients[serverName]
        if (!client) {
            return {
                success: false,
                error: `No active connection for server: ${serverName}`,
            }
        }

        console.log(`Getting tools list from server: ${serverName}`)
        const result = await client.listTools()

        if (!result || !result.tools || result.tools.length === 0) {
            return {
                success: false,
                error: 'No tools found',
            }
        }

        // Convert MCP tools to our Tool interface
        const tools: Tool[] = result.tools.map(tool => {
            // Ensure we have a valid inputSchema
            const inputSchema = tool.inputSchema || { type: 'object', properties: {} }

            // Clean up tool description if available
            let cleanedDescription = tool.description
                ? tool.description.replace(/\n\s+/g, '\n')
                : ''

            // Extract parameters from the input schema, passing the tool description
            const parameters = extractParametersFromSchema(inputSchema, cleanedDescription)

            // Further clean up tool description by removing the Args section now that they have been extracted
            if (cleanedDescription.includes('Args:')) {
                cleanedDescription = cleanedDescription.split('Args:')[0].trim()
            }

            return {
                name: tool.name,
                description: cleanedDescription,
                inputSchema: {
                    type: inputSchema.type || 'object',
                    properties: inputSchema.properties || {},
                    required: Array.isArray(inputSchema.required) ? inputSchema.required : [],
                },
                parameters,
            }
        })

        console.log(`Found ${tools.length} tools on server: ${serverName}`)
        return {
            success: true,
            data: tools,
        }
    } catch (error) {
        console.error(`Failed to get tools list from server ${serverName}:`, error)
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * Extract parameters from a JSON schema
 * @param schema The JSON schema to extract parameters from
 * @param cleanToolDescription The tool description to extract parameter descriptions from if not provided in schema
 * @returns An array of tool parameters
 */
function extractParametersFromSchema(schema: any, cleanToolDescription: string): any[] {
    if (!schema || !schema.properties) {
        return []
    }

    const parameters = []
    const required = Array.isArray(schema.required) ? schema.required : []

    for (const [name, prop] of Object.entries<any>(schema.properties)) {
        const isRequired = required.includes(name)
        let type = ToolParameterType.STRING // Default to string

        // Map JSON schema types to our ToolParameterType
        switch (prop.type) {
            case 'number':
            case 'integer':
                type = ToolParameterType.NUMBER
                break
            case 'boolean':
                type = ToolParameterType.BOOLEAN
                break
            case 'array':
                type = ToolParameterType.ARRAY
                break
            case 'object':
                type = ToolParameterType.OBJECT
                break
            default:
                type = ToolParameterType.STRING
                break
        }

        // Get description from property or empty string
        let description = prop.description || ''

        // If description is empty and we have a tool description, try to extract it from there
        if (!description && cleanToolDescription.includes(`${name}:`)) {
            try {
                const descriptionMatch = cleanToolDescription
                    .split(`${name}:`)[1]
                    .split('\n')[0]
                    .trim()

                if (descriptionMatch) {
                    description = descriptionMatch
                }
            } catch (error) {
                console.log(`Error extracting description for parameter ${name}:`, error)
            }
        }

        parameters.push({
            name,
            type,
            required: isRequired,
            description,
        })
    }

    return parameters
}

/**
 * Execute a tool on an MCP server
 * @param serverName The name of the server
 * @param toolName The name of the tool
 * @param params The parameters for the tool
 * @returns A promise that resolves to an ApiResponse containing the result
 */
export async function executeTool(
    serverName: string,
    toolName: string,
    params: any
): Promise<ApiResponse<any>> {
    try {
        const client = activeClients[serverName]
        if (!client) {
            return {
                success: false,
                error: `No active connection for server: ${serverName}`,
            }
        }

        console.log(`Executing tool ${toolName} on server ${serverName} with params:`, params)

        // Call the tool with the parameters
        const result = await client.callTool({
            name: toolName,
            arguments: params,
        })

        console.log(`Tool ${toolName} executed successfully on server ${serverName}`)
        return {
            success: true,
            data: result,
        }
    } catch (error) {
        console.error(`Failed to execute tool ${toolName} on server ${serverName}:`, error)
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
