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

    get wsUrlWithToken(): string {
        if (this.sessionToken) {
            return `${this.wsUrl}?token=${encodeURIComponent(this.sessionToken)}`;
        }
        return this.wsUrl;
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

    private startPromise: Promise<boolean> | null = null;

    async ensureRunning(): Promise<boolean> {
        // If we're already starting, wait for that to finish
        if (this.startPromise) {
            return this.startPromise;
        }
        // If we already have a token and the server is healthy, we're good
        if (this.sessionToken && this.serverProcess) {
            const healthy = await this.checkHealth();
            if (healthy) return true;
        }
        return this.start();
    }

    async start(): Promise<boolean> {
        // Deduplicate concurrent calls
        if (this.startPromise) return this.startPromise;

        this.startPromise = this._startImpl();
        try {
            return await this.startPromise;
        } finally {
            this.startPromise = null;
        }
    }

    private async _startImpl(): Promise<boolean> {
        // Check if there's already a server we started
        if (this.sessionToken && this.serverProcess) {
            const healthy = await this.checkHealth();
            if (healthy) return true;
        }

        // Check if a server is running on our port that we didn't start
        const existingHealthy = await this.checkHealth();
        if (existingHealthy && !this.sessionToken) {
            // Server running but we don't know its token (started by desktop app)
            // Start our own on a different port
            console.log('[Hermes] Server running with unknown token, starting our own on port', this.port + 1);
            this.port = this.port + 1;
        }

        this.sessionToken = 'hvs-' + Math.random().toString(36).substring(2, 8) + '-' + Date.now().toString(36);
        console.log('[Hermes] Starting server with token:', this.sessionToken, 'on port', this.port);

        return new Promise((resolve) => {
            const env = { ...process.env, HERMES_DASHBOARD_SESSION_TOKEN: this.sessionToken };
            this.serverProcess = cp.spawn('hermes', ['serve', '--port', String(this.port)], {
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let started = false;
            let healthInterval: NodeJS.Timeout;

            const timeout = setTimeout(() => {
                if (!started) {
                    resolve(false);
                }
            }, 15000);

            const onData = async (data: Buffer) => {
                const text = data.toString();
                console.log('[Hermes] server output:', text.slice(0, 200));
                if (!started && (text.includes('listening') || text.includes('BACKEND_READY') || text.includes('Uvicorn') || text.includes('startup'))) {
                    started = true;
                    clearTimeout(timeout);
                    clearInterval(healthInterval);
                    await new Promise(r => setTimeout(r, 2000));
                    const healthy = await this.checkHealth();
                    console.log('[Hermes] Health after start:', healthy);
                    resolve(healthy);
                }
            };

            this.serverProcess.stdout?.on('data', onData);
            this.serverProcess.stderr?.on('data', onData);

            this.serverProcess.on('error', (err) => {
                console.error('[Hermes] Spawn error:', err);
                if (!started) {
                    clearTimeout(timeout);
                    clearInterval(healthInterval);
                    resolve(false);
                }
            });

            this.serverProcess.on('exit', (code) => {
                console.log('[Hermes] Server exited with code:', code);
                if (!started) {
                    clearTimeout(timeout);
                    clearInterval(healthInterval);
                    resolve(false);
                }
            });

            // Poll health endpoint every 2s as fallback
            healthInterval = setInterval(async () => {
                if (started) {
                    clearInterval(healthInterval);
                    return;
                }
                const healthy = await this.checkHealth();
                if (healthy) {
                    started = true;
                    clearInterval(healthInterval);
                    clearTimeout(timeout);
                    console.log('[Hermes] Server detected via health poll');
                    resolve(true);
                }
            }, 2000);
        });
    }

    async stop(): Promise<void> {
        // Only kill the process WE started — never touch the desktop app's server
        if (this.serverProcess) {
            this.serverProcess.kill('SIGTERM');
            this.serverProcess = null;
            this.sessionToken = '';
        }
    }

    async listSessions(limit: number = 50): Promise<SessionInfo[]> {
        return new Promise((resolve) => {
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