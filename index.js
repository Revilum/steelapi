import express from 'express'
import { HLTV } from 'hltv-next'
import bodyParser from 'body-parser'
import path from 'path'
import { MongoClient } from "mongodb"
import FlareSolverrSessionManager from './sessionManager.js';

// Initialize the session manager
const sessionManager = new FlareSolverrSessionManager();

const hltv = HLTV.createInstance({
	loadPage: async (url) => {
        return await sessionManager.makeRequest(url);
}});

const mongoClient = new MongoClient(process.env.MONGO_URL, {
	maxPoolSize: 10,
	minPoolSize: 2,
	maxIdleTimeMS: 30000,
	serverSelectionTimeoutMS: 5000,
	socketTimeoutMS: 45000
})
await mongoClient.connect()

const app = express()
app.use(bodyParser.json())

function reportError(err, func, opt) {
    console.error(err)
	// Fire-and-forget error logging to avoid blocking the response
	mongoClient.db("hltv").collection("errors").insertOne({
		"error": err.toString(),
		"function": func,
		"createdAt": new Date(),
		"options": opt
	}).then(result => result.insertedId).catch(logErr => {
		console.error("Failed to log error to database:", logErr);
	})
	// Return a synchronous ID for immediate response
	return Date.now().toString()
}

function createEndpoint(endpoint, func) {
	app.post(endpoint, async (req, res) => {
		try {
			const response = await func(req.body)
			res.json(response)
		} catch (err) {
			const errorId = reportError(err, path.parse(endpoint).base, req.body)
			res.status(400).send({error: err.toString(), id: errorId})
		}
	})
}

const dict = {
	"/api/getMatch": hltv.getMatch,
	"/api/getMatches": hltv.getMatches,
	"/api/getMatchesStats": hltv.getMatchesStats,
	"/api/getMatchStats": hltv.getMatchStats,
	"/api/getMatchMapStats": hltv.getMatchMapStats,
	"/api/getStreams": hltv.getStreams,
	"/api/getRecentThreads": hltv.getRecentThreads,
	"/api/getTeamRanking": hltv.getTeamRanking,
	"/api/getTeam": hltv.getTeam,
	"/api/getTeamByName": hltv.getTeamByName,
	"/api/getTeamStats": hltv.getTeamStats,
	"/api/getPlayer": hltv.getPlayer,
	"/api/getPlayerByName": hltv.getPlayerByName,
	"/api/getPlayerStats": hltv.getPlayerStats,
	"/api/getPlayerRanking": hltv.getPlayerRanking,
	"/api/getEvents": hltv.getEvents,
	"/api/getEvent": hltv.getEvent,
	"/api/getEventByName": hltv.getEventByName,
	"/api/getPastEvents": hltv.getPastEvents,
	"/api/getResults": hltv.getResults,
	"/api/getNews": hltv.getNews,
	"/api/getRssNews": HLTV.getRssNews
}

for (const [key, value] of Object.entries(dict)) {
	createEndpoint(key, value)
}

app.get('/api/sessions/stats', (req, res) => {
    res.json(sessionManager.getStats());
});

process.on('SIGINT', async () => {
    await sessionManager.destroyAllSessions();
    await mongoClient.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await sessionManager.destroyAllSessions();
    await mongoClient.close();
    process.exit(0);
});

app.listen(3000, () => {
	console.log('Listening on port 3000...')
})
