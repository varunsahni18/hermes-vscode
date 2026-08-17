import * as vscode from 'vscode';
import { HermesConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';

export interface ProfileItem extends vscode.TreeItem {
    profileName: string;
    isActive: boolean;
    isDefault: boolean;
}

export class ProfileProvider implements vscode.TreeDataProvider<ProfileItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProfileItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private config: HermesConfig) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ProfileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ProfileItem): Promise<ProfileItem[]> {
        if (element) {
            return [];
        }

        try {
            const profiles = await this.fetchProfiles();
            return profiles;
        } catch {
            return [this.placeholderItem('Failed to load profiles', true)];
        }
    }

    /**
     * Fetch profiles by reading the ~/.hermes/profiles/ directory
     * and checking which is the default profile.
     */
    private async fetchProfiles(): Promise<ProfileItem[]> {
        const profilesDir = this.config.profilesDir;
        const defaultProfile = this.config.defaultProfile;
        const items: ProfileItem[] = [];

        // The "default" profile is always available (it's the main ~/.hermes)
        const defaultItem = new vscode.TreeItem('default', vscode.TreeItemCollapsibleState.None) as ProfileItem;
        defaultItem.profileName = 'default';
        defaultItem.isActive = !defaultProfile || defaultProfile === 'default';
        defaultItem.isDefault = true;
        defaultItem.description = defaultItem.isActive ? '● active' : '';
        defaultItem.iconPath = new vscode.ThemeIcon(defaultItem.isActive ? 'circle-filled' : 'circle-outline');
        defaultItem.tooltip = 'The default Hermes profile (~/.hermes)';
        defaultItem.contextValue = 'profile';
        items.push(defaultItem);

        // Read named profiles
        try {
            if (fs.existsSync(profilesDir)) {
                const entries = fs.readdirSync(profilesDir, { withFileTypes: true })
                    .filter(e => e.isDirectory())
                    .map(e => e.name)
                    .sort();

                for (const name of entries) {
                    // Skip hidden dirs
                    if (name.startsWith('.')) continue;

                    const isActive = name === defaultProfile;
                    const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None) as ProfileItem;
                    item.profileName = name;
                    item.isActive = isActive;
                    item.isDefault = false;
                    item.description = isActive ? '● active' : this.getProfileModel(name);
                    item.iconPath = new vscode.ThemeIcon(isActive ? 'circle-filled' : 'circle-outline');
                    item.tooltip = `Profile: ${name}\n${this.getProfileInfo(name)}`;
                    item.contextValue = 'profile';
                    items.push(item);
                }
            }
        } catch {
            // Ignore read errors
        }

        if (items.length === 0) {
            return [this.placeholderItem('No profiles found', false)];
        }

        return items;
    }

    /**
     * Try to read a profile's configured model from its config.yaml
     */
    private getProfileModel(profileName: string): string {
        try {
            const configPath = `${this.config.profilesDir}/${profileName}/config.yaml`;
            if (!fs.existsSync(configPath)) return '';
            const content = fs.readFileSync(configPath, 'utf8');
            const match = content.match(/^model:\s*(.+)$/m);
            return match ? match[1].trim() : '';
        } catch {
            return '';
        }
    }

    private getProfileInfo(profileName: string): string {
        const model = this.getProfileModel(profileName);
        const parts = [`Path: ~/.hermes/profiles/${profileName}`];
        if (model) parts.push(`Model: ${model}`);
        return parts.join('\n');
    }

    private placeholderItem(label: string, isError: boolean): ProfileItem {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None) as ProfileItem;
        item.iconPath = new vscode.ThemeIcon(isError ? 'error' : 'info');
        item.profileName = '';
        item.isActive = false;
        item.isDefault = false;
        return item;
    }

    /**
     * Show a quick pick to choose a profile.
     */
    async pickProfile(): Promise<string | undefined> {
        const profiles = await this.getChildren();

        const items: (vscode.QuickPickItem & { profileName: string })[] = profiles.map(p => ({
            label: p.label?.toString() || p.profileName,
            description: typeof p.description === 'string' ? p.description : '',
            detail: p.tooltip?.toString(),
            profileName: p.profileName,
        }));

        if (items.length === 0) {
            vscode.window.showInformationMessage('Hermes: No profiles found.');
            return undefined;
        }

        const chosen = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a Hermes profile',
        });

        return chosen?.profileName;
    }
}