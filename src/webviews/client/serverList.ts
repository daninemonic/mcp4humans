// Type definition for the VS Code API exposed by acquireVsCodeApi
interface VsCodeApi {
    postMessage(message: any): void
}

// Declare the VS Code API function provided by VS Code
declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

document.addEventListener('DOMContentLoaded', () => {
    const addServerButton = document.getElementById('add-server-button')
    if (addServerButton) {
        addServerButton.addEventListener('click', () => {
            vscode.postMessage({
                command: 'addServer',
            })
        })
    }

    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data
        switch (message.command) {
            case 'updateServerList':
                renderServerList(message.servers)
                break
        }
    })

    // Request initial server list from the extension
    vscode.postMessage({
        command: 'requestServerList',
    })
})

function renderServerList(servers: any[]) {
    const serverListDiv = document.getElementById('server-list')
    if (!serverListDiv) {
        return
    }

    serverListDiv.innerHTML = '' // Clear current list

    servers.forEach(server => {
        const serverButton = document.createElement('div')
        serverButton.classList.add('server-button')
        serverButton.innerHTML = `
            <span class="status-icon">${getServerStatusIcon(server.status)}</span>
            <span class="server-name">${server.name}</span>
            <span class="server-type">${server.transportType}</span>
        `
        serverButton.addEventListener('click', () => {
            vscode.postMessage({
                command: 'selectServer',
                serverName: server.name,
            })
        })
        serverListDiv.appendChild(serverButton)
    })
}

function getServerStatusIcon(status: string): string {
    // Replace with actual icons or classes based on status
    switch (status) {
        case 'connected':
            return '🟢' // Green circle
        case 'disconnected':
            return '🔴' // Red circle
        case 'connecting':
            return '🟡' // Yellow circle
        default:
            return '⚪' // White circle
    }
}
