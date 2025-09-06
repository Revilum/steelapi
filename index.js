import express from 'express'
import { HLTV } from 'hltv-next'
import bodyParser from 'body-parser'
import path from 'path'
import { MongoClient } from "mongodb"
import axios from "axios";

async function sendPayload(cmd, url = null) {
    const payload = { cmd: cmd };
    payload.maxTimeout = process.env.FLARESOLVERR_TIMEOUT;
    if (process.env.PROXY_SERVER) {
        payload.proxy = { url: process.env.PROXY_SERVER };
    }

    if (cmd === "sessions.create") {
        payload.session = process.env.FLARESOLVERR_SESSION_NAME;
    }
    if (cmd === "request.get") {
        payload.session = process.env.FLARESOLVERR_SESSION_NAME;
        payload.url = url;
    }

    const response = await axios.post(process.env.FLARESOLVERR_URL, payload);
    if (response.data.status !== 'ok') {
        throw new Error(`${response.data.status} - ${response.data.message}`);
    }
    return response.data;
}

async function initializeFlareSolverr() {
    try {
        console.log('Initializing FlareSolverr session...');

        const sessionList = await sendPayload("sessions.list");
        const existingSession = sessionList.sessions.find(session => session.name === process.env.FLARESOLVERR_SESSION_NAME);

        if (existingSession) {
            console.log(`FlareSolverr session '${process.env.FLARESOLVERR_SESSION_NAME}' already exists.`);
            return;
        }
        await sendPayload("sessions.create");
        console.log(`FlareSolverr session '${process.env.FLARESOLVERR_SESSION_NAME}' created successfully.`);
    } catch (error) {
        console.error('Error initializing FlareSolverr session:', error.message);
        process.exit(1);
    }

}

const hltv = HLTV.createInstance({
	loadPage: async (url) => {
        return (await axios.post(process.env.FLARESOLVERR_URL, {
            "cmd": "request.get",
            "url": url,
            "session": process.env.FLARESOLVERR_SESSION_NAME,
            "maxTimeout": 60000
            }, {
            headers: {"Content-Type": "application/json"}}
        )).data.solution.response
}});

const mongoClient = new MongoClient(process.env.MONGO_URL)
await mongoClient.connect()

const app = express()
app.use(bodyParser.json())

async function reportError(err, func, opt) {
    console.error(err)
	return (await mongoClient.db("hltv").collection("errors").insertOne({
		"error": err.toString(),
		"function": func,
		"createdAt": new Date(),
		"options": opt
	})).insertedId
}

function createEndpoint(endpoint, func) {
	app.post(endpoint, async (req, res) => {
		try {
			const response = await func(req.body)
			res.json(response)
		} catch (err) {
			const errorId = await reportError(err, path.parse(endpoint).base, req.body)
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

await initializeFlareSolverr();

app.listen(3000, () => {
	console.log('Listening on port 3000...')
})
