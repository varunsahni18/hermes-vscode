import * as vscode from 'vscode';
import { HermesConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SessionItem extends vscode.TreeItem {
    sessionId: string;
    title: string;
    model?: string;
    source?: string;
    messageCount?: number;
    lastActive?: string;
}

export class SessionProvider implements vscode.TreeDataProvider<SessionItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private config: HermesConfig) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SessionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SessionItem): Promise<SessionItem[]> {
        if (element) {
            // No children for sessions
            return [];
        }

        try {
            const sessions = await this.fetchSessions();
            return sessions;
        } catch (err) {
            // Return a placeholder showing the error
            const item = new vscode.TreeItem('Failed to load sessions', vscode.TreeItemCollapsibleState.None) as SessionItem;
            item.tooltip = String(err);
            item.iconPath = new vscode.ThemeIcon('error');
            item.sessionId = '';
            item.title = 'Failed to load sessions';
            return [item];
        }
    }

    /**
     * Fetch sessions from the Hermes SQLite database via the hermes CLI.
     * Uses `hermes sessions list --json` which is always available.
     */
    private async fetchSessions(): Promise<SessionItem[]> {
        const exe = this.config.executablePath;
        const limit = this.config.sessionLimit;

        return new Promise<SessionItem[]>((resolve) => {
            const { exec } = require('child_process');
            const cmd = `"${exe}" sessions list --json 2>/dev/null || true`;
            const home = process.env.HOME || process.env.USERPROFILE || '';
            const env = { ...process.env, HOME: home };

            exec(cmd, { timeout: 5000, env, maxBuffer: 1024 * 1024 }, (err: any, stdout: string) => {
                if (err || !stdout.trim()) {
                    // Fallback: try reading the sessions directory
                    resolve(this.fallbackSessions());
                    return;
                }

                try {
                    const data = JSON.parse(stdout);
                    const sessions = Array.isArray(data) ? data : (data.sessions || []);
                    const items: SessionItem[] = sessions.slice(0, limit).map((s: any) => {
                        const title = s.title || s.preview || s.id || 'Untitled';
                        const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None) as SessionItem;
                        item.sessionId = s.id || s.session_id || '';
                        item.title = title;
                        item.model = s.model;
                        item.source = s.source;
                        item.messageCount = s.message_count || s.messages;
                        item.lastActive = s.last_active || s.updated_at || s.when;
                        item.description = this.formatDescription(s);
                        item.tooltip = this.formatTooltip(s);
                        item.iconPath = this.getIcon(s.source);
                        item.contextValue = 'session';
                        item.command = {
                            command: 'hermes.resumeSession',
                            title: 'Resume',
                            arguments: [item],
                        };
                        return item;
                    });

                    if (items.length === 0) {
                        resolve([this.placeholderItem('No sessions found', 'Start a new agent to create one')]);
                        return;
                    }

                    resolve(items);
                } catch {
                    resolve(this.fallbackSessions());
                }
            });
        });
    }

    /**
     * Fallback: read session files from ~/.hermes/sessions/
     */
    private fallbackSessions(): SessionItem[] {
        const sessionsDir = `${this.config.hermesHome}/sessions`;
        try {
            if (!fs.existsSync(sessionsDir)) {
                return [this.placeholderItem('No sessions directory', 'Run hermes to create one')];
            }

            const files = fs.readdirSync(sessionsDir)
                .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
                .map(f => {
                    const fullPath = path.join(sessionsDir, f);
                    const stat = fs.statSync(fullPath);
                    return { file: fullPath, name: f, mtime: stat.mtime };
                })
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
                .slice(0, this.config.sessionLimit);

            if (files.length === 0) {
                return [this.placeholderItem('No sessions found', 'Start a new agent to create one')];
            }

            return files.map(f => {
                const name = f.name.replace(/\.(jsonl?|json)$/, '');
                const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None) as SessionItem;
                item.sessionId = name;
                item.title = name;
                item.lastActive = f.mtime.toISOString();
                item.description = this.relativeTime(f.mtime);
                item.tooltip = `Session: ${name}\nModified: ${f.mtime.toLocaleString()}`;
                item.iconPath = new vscode.ThemeIcon('history');
                item.contextValue = 'session';
                item.command = {
                    command: 'hermes.resumeSession',
                    title: 'Resume',
                    arguments: [item],
                };
                return item;
            });
        } catch {
            return [this.placeholderItem('Cannot read sessions', 'Check that Hermes is installed')];
        }
    }

    private placeholderItem(label: string, desc: string): SessionItem {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None) as SessionItem;
        item.description = desc;
        item.iconPath = new vscode.ThemeIcon('info');
        item.sessionId = '';
        item.title = label;
        return item;
    }

    private formatDescription(s: any): string {
        const parts: string[] = [];
        if (s.source && s.source !== 'cli') {
            parts.push(s.source);
        }
        if (s.model) {
            parts.push(s.model);
        }
        const time = s.last_active || s.updated_at || s.when;
        if (time) {
            parts.push(this.relativeTimeStr(time));
        }
        return parts.join(' • ');
    }

    private formatTooltip(s: any): string {
        const lines = [`Session: ${s.id || s.session_id || 'unknown'}`];
        if (s.title) lines.push(`Title: ${s.title}`);
        if (s.model) lines.push(`Model: ${s.model}`);
        if (s.source) lines.push(`Source: ${s.source}`);
        if (s.message_count || s.messages) lines.push(`Messages: ${s.message_count || s.messages}`);
        if (s.last_active || s.updated_at) lines.push(`Last active: ${s.last_active || s.updated_at}`);
        return lines.join('\n');
    }

    private getIcon(source?: string): vscode.IconPath {
        switch (source) {
            case 'telegram': return new vscode.ThemeIcon('comment');
            case 'discord': return new vscode.ThemeIcon('comment-discussion');
            case 'slack': return new vscode.ThemeIcon('mention');
            case 'cron': return new vscode.ThemeIcon('clock');
            case 'web': return new vscode.ThemeIcon('globe');
            default: return new vscode.ThemeIcon('terminal');
        }
    }

    private relativeTime(date: Date): string {
        const diff = Date.now() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    private relativeTimeStr(time: string): string {
        try {
            return this.relativeTime(new Date(time));
        } catch {
            return time;
        }
    }
}