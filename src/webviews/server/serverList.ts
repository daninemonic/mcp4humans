import * as vscode from 'vscode'
import * as fs from 'fs'
import { StorageService } from '../../services/storage'
import { mcpIsServerConnected } from '../../services/mcpClient'
import { getNonce } from '../../utils/webviewUtils'
import { ServerStatus, ServerSchema } from '../../models/types'
import { vscServerViewAdd, vscServerViewDetail } from '../../models/commands'

export class ServerListProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'mcp4humans.serverList' // Define a unique view ID

    private _view?: vscode.WebviewView

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private storageService: StorageService // Inject the storage service
    ) {}

    private getServersWithStatus(): ServerSchema[] {
        const servers = this.storageService.getServers()
        servers.forEach(server => {
            server.status = mcpIsServerConnected(server.name)
                ? ServerStatus.CONNECTED
                : ServerStatus.DISCONNECTED
        })
        return servers
    }

    public updateServerList() {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateServerList',
                servers: this.getServersWithStatus(),
            })
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): Thenable<void> | void {
        this._view = webviewView

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        }

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'requestServerList':
                    this.updateServerList()
                    break
                case 'addServer':
                    vscServerViewAdd()
                    break
                case 'selectServer':
                    // Handle server selection (e.g., open server view)
                    const schema = this.getServersWithStatus().find(
                        s => s.name === message.serverName
                    )
                    if (schema) {
                        vscServerViewDetail(schema)
                    }
                    break
            }
        })
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const htmlFilePath = vscode.Uri.joinPath(
            this._extensionUri,
            'dist',
            'webviews',
            'html',
            'serverList.html'
        )
        let htmlContent = fs.readFileSync(htmlFilePath.fsPath, 'utf8')

        // Local path to main script run in the webview
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webviews', 'js', 'serverList.js')
        )

        // Local path to CSS styles
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webviews', 'css', 'serverList.css')
        )

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce()

        // Inject URIs and nonce into the HTML
        htmlContent = htmlContent.replace('${webviewCss}', styleMainUri.toString())
        htmlContent = htmlContent.replace(
            '<head>',
            `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">`
        )
        // Add nonce to the script tag
        htmlContent = htmlContent.replace(
            '<script src="${webviewClientJs}"></script>',
            `<script nonce="${nonce}" src="${scriptUri}"></script>`
        )

        return htmlContent
    }
}
