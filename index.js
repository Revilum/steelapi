import express from 'express'
import { HLTV } from 'hltv-next'
import bodyParser from 'body-parser'
import path from 'path'
import { MongoClient } from "mongodb"
import axios from "axios";

const FLARESOLVERR_SESSION = 'steelapi_session';
async function initializeFlareSolverr() {
    try {
        console.log('Initializing FlareSolverr session...');

        const sessionPayload = {
            cmd: "sessions.create",
            session: FLARESOLVERR_SESSION
        }
        if (process.env.PROXY_SERVER) {
            sessionPayload.proxy = {url: process.env.PROXY_SERVER}
        }

        const response = await axios.post(process.env.FLARESOLVERR_URL, sessionPayload, {
            headers: {"Content-Type": "application/json"}
        });

        if (response.data.status === 'ok') {
            console.log(`FlareSolverr session '${FLARESOLVERR_SESSION}' created successfully`);
        } else {
            console.error('Failed to create FlareSolverr session:', response.data);
        }
    } catch (error) {
        console.error('Error initializing FlareSolverr session:', error.message);
    }
}

const hltv = HLTV.createInstance({
	loadPage: async (url) => {
        return (await axios.post(process.env.FLARESOLVERR_URL, {
            "cmd": "request.get",
            "url": url,
            "session": FLARESOLVERR_SESSION,
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
