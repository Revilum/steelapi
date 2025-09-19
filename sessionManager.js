import axios from 'axios';
import { EventEmitter } from 'events';

class FlareSolverrSessionManager extends EventEmitter {
    constructor() {
        super();
        this.numSessions = parseInt(process.env.FLARESOLVERR_NUM_SESSIONS) || 3;
        this.sessions = [];
        this.requestQueue = [];
        this.initialized = false;
    }

    async sendFlaresolverrRequest(cmd, sessionId = null, url = null) {
        const payload = { cmd };

        if (sessionId) {
            payload.session = sessionId;
        }

        if (url) {
            payload.url = url;
        }

        if (process.env.PROXY_SERVER) {
            payload.proxy = { url: process.env.PROXY_SERVER };
        }

        const response = await axios.post(process.env.FLARESOLVERR_URL, payload, {
            headers: { "Content-Type": "application/json" }
        });

        if (response.data.status !== 'ok') {
            throw new Error(`FlareSolverr request failed: ${response.data.status} - ${response.data.message}`);
        }

        return response.data;
    }

    async initialize() {
        if (this.initialized) return;
        this.initialized = true;
        console.log(`Initializing ${this.numSessions} FlareSolverr sessions...`);

        for (let i = 0; i < this.numSessions; i++) {
            const sessionId = `session_${i}_${Date.now()}`;
            try {
                await this.sendFlaresolverrRequest("sessions.create", sessionId);
                this.sessions.push({
                    id: sessionId,
                    inUse: false,
                    createdAt: new Date()
                });
                console.log(`Created session: ${sessionId}`);
            } catch (error) {
                console.error(`Failed to create session ${sessionId}:`, error.message);
            }
        }


        console.log(`Session manager initialized with ${this.sessions.length} sessions`);
    }

    getFreeSession() {
        return this.sessions.find(session => !session.inUse);
    }

    async acquireSession() {
        return new Promise((resolve, reject) => {
            const freeSession = this.getFreeSession();

            if (freeSession) {
                freeSession.inUse = true;
                resolve(freeSession);
            } else {
                this.requestQueue.push({ resolve, reject, timestamp: Date.now() });
                console.log(`Request queued. Queue length: ${this.requestQueue.length}`);
            }
        });
    }

    releaseSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.inUse = false;

            if (this.requestQueue.length > 0) {
                const { resolve } = this.requestQueue.shift();
                session.inUse = true;
                resolve(session);
                console.log(`Session ${sessionId} assigned to queued request. Queue length: ${this.requestQueue.length}`);
            }
        }
    }

    async makeRequest(url) {
        if (!this.initialized) {
            await this.initialize();
        }

        const session = await this.acquireSession();

        try {
            const response = await this.sendFlaresolverrRequest("request.get", session.id, url);
            return response.solution.response;
        } finally {
            this.releaseSession(session.id);
        }
    }

    getStats() {
        return {
            totalSessions: this.sessions.length,
            activeSessions: this.sessions.filter(s => s.inUse).length,
            queueLength: this.requestQueue.length,
            sessions: this.sessions.map(s => ({
                id: s.id,
                inUse: s.inUse,
                createdAt: s.createdAt
            }))
        };
    }

    async destroyAllSessions() {
        console.log('Destroying all FlareSolverr sessions...');

        for (const session of this.sessions) {
            try {
                await this.sendFlaresolverrRequest("sessions.destroy", session.id);
                console.log(`Destroyed session: ${session.id}`);
            } catch (error) {
                console.error(`Failed to destroy session ${session.id}:`, error.message);
            }
        }

        this.sessions = [];
        this.initialized = false;
    }
}

export default FlareSolverrSessionManager;
