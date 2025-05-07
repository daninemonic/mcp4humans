/**
 * Webview utilities
 * 
 * This module provides utility functions for working with webviews.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Get the HTML content for a webview
 * @param webview The webview to get HTML for
 * @param extensionUri The URI of the extension
 * @param templatePath The path to the HTML template file (relative to the extension root)
 * @param replacements A map of placeholders to their values
 * @returns The HTML content for the webview
 */
export function getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    templatePath: string,
    replacements: Record<string, string>
): string {
    // Get the local path to the template file
    const templatePathOnDisk = vscode.Uri.joinPath(extensionUri, templatePath);
    
    // Read the template file
    let templateContent = fs.readFileSync(templatePathOnDisk.fsPath, 'utf8');
    
    // Replace all placeholders with their values
    for (const [placeholder, value] of Object.entries(replacements)) {
        templateContent = templateContent.replace(new RegExp(`\\$\\{${placeholder}\\}`, 'g'), value);
    }
    
    // Replace all resource paths with webview URIs
    templateContent = replaceResourcePaths(webview, extensionUri, templateContent);
    
    return templateContent;
}

/**
 * Replace resource paths in HTML content with webview URIs
 * @param webview The webview to get URIs for
 * @param extensionUri The URI of the extension
 * @param content The HTML content to process
 * @returns The processed HTML content
 */
function replaceResourcePaths(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    content: string
): string {
    // Replace all resource paths with webview URIs
    // Example: ${webview.resource:path/to/resource} -> vscode-webview-resource://...
    const resourceRegex = /\$\{webview\.resource:(.*?)\}/g;
    
    return content.replace(resourceRegex, (match, resourcePath) => {
        const resourceUri = vscode.Uri.joinPath(extensionUri, resourcePath);
        return webview.asWebviewUri(resourceUri).toString();
    });
}
