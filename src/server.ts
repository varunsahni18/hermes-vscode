import { HermesConfig } from './config';
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as http from 'http';

interface SessionInfo {
    id: string;
    title: string;
    source: string;
    model: string;
    message_count: number;
    last_activity_at: number;
    cwd: string | null;
}

export class HermesServer {
    private serverProcess: cp.ChildProcess | null = null;
    private sessionToken: string = '';
    private port: number;
    private host: string;

    constructor(private config: HermesConfig) {
        this.port = config.serverPort;
        this.host = config.serverHost;
    }

    get baseUrl(): string {
        return `http://${this.host}:${this.port}`;
    }

    get wsUrl(): string {
        return `ws://${this.host}:${this.port}/api/ws`;
    }

    get token(): string {
        return this.sessionToken;
    }

    setToken(token: string): void {
        this.sessionToken = token;
    }

    get wsUrlWithToken(): string {
        return `${this.wsUrl}?token=${encodeURIComponent(this.sessionToken)}`;
    }

    async checkHealth(): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.get(`${this.baseUrl}/api/health`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.ok === true);
                    } catch {
                        resolve(false);
                    }
                });
            });
            req.on('error', () => resolve(false));
            req.setTimeout(3000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }

    async ensureRunning(): Promise<boolean> {
        const healthy = await this.checkHealth();
        if (healthy) {
            // Server already running — try to discover the token
            await this.discoverToken();
            return true;
        }

        // Start the server
        return this.start();
    }

    async start(): Promise<boolean> {
        // Generate a known token
        this.sessionToken = 'vscode-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        return new Promise((resolve) => {
            const env = { ...process.env, HERMES_DASHBOARD_SESSION_TOKEN: this.sessionToken };
            this.serverProcess = cp.spawn('hermes', ['serve', '--port', String(this.port), '--host', this.host], {
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
            });

            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    resolve(false);
                }
            }, 10000);

            this.serverProcess.stdout?.on('data', (data) => {
                const text = data.toString();
                if (!started && (text.includes('listening') || text.includes('started') || text.includes('Uvicorn'))) {
                    started = true;
                    clearTimeout(timeout);
                    // Wait a moment for the server to be ready
                    setTimeout(async () => {
                        const healthy = await this.checkHealth();
                        resolve(healthy);
                    }, 2000);
                }
            });

            this.serverProcess.stderr?.on('data', (data) => {
                const text = data.toString();
                if (!started && (text.includes('listening') || text.includes('started') || text.includes('Uvicorn'))) {
                    started = true;
                    clearTimeout(timeout);
                    setTimeout(async () => {
                        const healthy = await this.checkHealth();
                        resolve(healthy);
                    }, 2000);
                }
            });

            this.serverProcess.on('error', () => {
                if (!started) {
                    clearTimeout(timeout);
                    resolve(false);
                }
            });

            this.serverProcess.on('exit', () => {
                if (!started) {
                    clearTimeout(timeout);
                    resolve(false);
                }
            });
        });
    }

    async stop(): Promise<void> {
        if (this.serverProcess) {
            this.serverProcess.kill('SIGTERM');
            this.serverProcess = null;
        }
        // Also try the hermes serve --stop command
        cp.exec(`hermes serve --stop`, () => {});
    }

    async discoverToken(): Promise<void> {
        // If the server is already running (started by hermes dashboard or CLI),
        // we need the token. On loopback, we can try to connect without a token
        // first, or check the env of the running process.
        // For now, try an empty token — loopback mode may accept it in some configs
        // If that fails, the user needs to start the server from the extension.
        // A better approach: check if HERMES_DASHBOARD_SESSION_TOKEN is in our env
        const envToken = process.env.HERMES_DASHBOARD_SESSION_TOKEN;
        if (envToken) {
            this.sessionToken = envToken;
            return;
        }
        // Try to get token from the server's process environment
        try {
            const { execSync } = cp;
            const procs = execSync('ps aux | grep "hermes serve" | grep -v grep', { encoding: 'utf8' });
            const match = procs.match(/HERMES_DASHBOARD_SESSION_TOKEN=(\S+)/);
            if (match) {
                this.sessionToken = match[1];
                return;
            }
        } catch {
            // No process found
        }
        // Fallback: try without a token (some configs allow it)
        this.sessionToken = '';
    }

    async listSessions(limit: number = 50): Promise<SessionInfo[]> {
        return new Promise((resolve, resolve_) => {
            const options: http.RequestOptions = {
                hostname: this.host,
                port: this.port,
                path: `/api/sessions?limit=${limit}`,
                method: 'GET',
                headers: {},
            };
            if (this.sessionToken) {
                options.headers = { 'Authorization': `Bearer ${this.sessionToken}` };
            }

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.sessions || json || []);
                    } catch {
                        resolve([]);
                    }
                });
            });
            req.on('error', () => resolve([]));
            req.setTimeout(5000, () => {
                req.destroy();
                resolve([]);
            });
            req.end();
        });
    }

    async listProfiles(): Promise<string[]> {
        // Read profiles from the filesystem
        const fs = require('fs');
        const path = require('path');
        const profilesDir = path.join(this.config.hermesHome, 'profiles');
        const profiles = ['default'];
        try {
            if (fs.existsSync(profilesDir)) {
                const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        profiles.push(entry.name);
                    }
                }
            }
        } catch {
            // ignore
        }
        return profiles;
    }
}