import * as fs from 'fs';
import * as path from 'path';

function loadHtmlAsset(name: string): string {
    const assetPath = path.join(__dirname, '..', 'media', name);
    try {
        return fs.readFileSync(assetPath, 'utf-8');
    } catch {
        return `<html><body>Failed to load ${name} — run 'npm run compile' first</body></html>`;
    }
}

export function getChatHtml(): string {
    return loadHtmlAsset('chat.html');
}
