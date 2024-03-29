const express = require('express')
const { HLTV } = require('hltv-next')
const bodyParser = require('body-parser')
const axios = require('axios')
const { gotScraping } = require('got-scraping')
const path = require('path')

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

const app = express()
app.use(bodyParser.json())

async function reportError(err, func, opt) {
	return (await axios.post(process.env.DEBUG_DOMAIN, {
		"error": err.toString(),
		"function": func,
		"options": opt
	})).data
	
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

dict = {
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
