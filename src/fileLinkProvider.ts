import * as vscode from 'vscode';
import { HermesConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Terminal link provider that detects file paths in Hermes tool output
 * and makes them clickable to open in the editor.
 */

// Extended link type to carry our data
interface HermesTerminalLink extends vscode.TerminalLink {
    data: { filePath: string; lineNum?: number; colNum?: number };
}

export class FileLinkProvider implements vscode.TerminalLinkProvider {
    constructor(private config: HermesConfig) {}

    // Patterns for file paths in tool output:
    // /Users/foo/project/src/file.py
    // ./src/file.py:42
    // src/file.py:10:5
    // ~/project/file.ts
    // /tmp/test/foo.py
    private static readonly PATTERNS = [
        // Absolute paths with optional line:col
        /(?:^|[\s([])((?:\/[\w.@-]+)+\.\w+)(?::(\d+))?(?::(\d+))?(?=[\s)\]:,]|$)/gm,
        // Relative paths with optional line:col (./ or ../ prefix)
        /(?:^|[\s([])(\.{1,2}\/[\w.@/-]+\.\w+)(?::(\d+))?(?::(\d+))?(?=[\s)\]:,]|$)/gm,
        // ~/ paths
        /(?:^|[\s([])(~\/[\w.@/-]+\.\w+)(?::(\d+))?(?::(\d+))?(?=[\s)\]:,]|$)/gm,
    ];

    provideTerminalLinks(
        context: vscode.TerminalLinkContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TerminalLink[]> {
        if (!this.config.autoOpenFileLinks) return [];
        if (!context.line) return [];

        const links: vscode.TerminalLink[] = [];

        for (const pattern of FileLinkProvider.PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(context.line)) !== null) {
                const filePath = match[1];
                const lineNum = match[2] ? parseInt(match[2], 10) - 1 : undefined;
                const colNum = match[3] ? parseInt(match[3], 10) - 1 : undefined;

                // Calculate start position (offset from the match start)
                const matchStart = match.index + match[0].indexOf(filePath);
                const length = filePath.length;

                const link: HermesTerminalLink = {
                    startIndex: matchStart,
                    length: length,
                    tooltip: `Open ${filePath}`,
                    data: { filePath, lineNum, colNum },
                };
                links.push(link);
            }
        }

        return links;
    }

    handleTerminalLink(link: vscode.TerminalLink): void {
        const hermesLink = link as HermesTerminalLink;
        const data = hermesLink.data;
        if (!data) return;

        let { filePath } = data;

        // Expand ~ to home
        if (filePath.startsWith('~/')) {
            const home = process.env.HOME || process.env.USERPROFILE || '';
            filePath = path.join(home, filePath.slice(2));
        }

        // Resolve relative paths against workspace root
        if (!path.isAbsolute(filePath)) {
            const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (wsRoot) {
                filePath = path.resolve(wsRoot, filePath);
            }
        }

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            vscode.window.showWarningMessage(`Hermes: File not found: ${filePath}`);
            return;
        }

        // Open the file
        const uri = vscode.Uri.file(filePath);
        const range = (data.lineNum !== undefined)
            ? new vscode.Range(data.lineNum, data.colNum || 0, data.lineNum, data.colNum || 0)
            : undefined;

        vscode.window.showTextDocument(uri, {
            selection: range,
            preview: false,
        }).then(
            () => {},
            (err) => {
                vscode.window.showErrorMessage(`Hermes: Failed to open ${filePath}: ${err.message}`);
            }
        );
    }
}