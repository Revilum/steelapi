import express from 'express'
import { HLTV } from 'hltv-next'
import bodyParser from 'body-parser'
import { gotScraping } from 'got-scraping'
import path from 'path'
import { MongoClient } from "mongodb"

const hltv = HLTV.createInstance({
	loadPage: (url) => gotScraping.get({
		url: url,
		proxyUrl: process.env.PROXY_ADDR,
		headerGeneratorOptions: {
			browsers: [
				{
					name: 'chrome',
					minVersion: 87,
					maxVersion: 89
				}
			],
			devices: ['desktop'],
			locales: ['de-DE', 'en-US'],
			operatingSystems: ['windows', 'linux'],
		}
	}).then((page) => page.body)
});

const mongoClient = new MongoClient(process.env.MONGO_URL)
await mongoClient.connect()

const app = express()
app.use(bodyParser.json())

async function reportError(err, func, opt) {
	return (await mongoClient.db("hltv").collection("errors").insertOne({
		"error": err.toString(),
		"function": func,
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
	"/api/getRssNews": hltv.getRssNews
}

for (const [key, value] of Object.entries(dict)) {
	createEndpoint(key, value)
}

app.listen(3000, () => {
	console.log('Listening on port 3000...')
})
