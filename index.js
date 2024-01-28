import dotenv from 'dotenv';
import { Client, Intents } from 'discord.js';

dotenv.config();

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

// Creating a service in Centos to run this bot:

// CREATE THIS FILE:
// root@FoodStock:~# cat /lib/systemd/system/yap_bot.service
// [Unit]
// Description=Yap Discord Bot
// Documentation=https://penguinore.net
// After=network.target
//
// [Service]
// Environment=CLIENT_TOKEN=<TOKEN>
// Type=simple
// User=root
// ExecStart=/usr/bin/node /var/www/html/lunch_yap/discord/index.js
// Restart=on-failure
//
// [Install]
// WantedBy=multi-user.target

// RUN THIS: systemctl start yap_bot.service

// EDIT THE DISCORD BOT: https://discord.com/developers/applications
// For now it's already attached to the channel so just do testing in the #testing channel

// But in future you would create the bot in developer zone, generate a URL with bot permissions, and then inside the channel
// visit that URL to invite the bot into the channel.

const LOCATIONS_COMMAND = '!locations';
const LUNCH_PLAN_COMMAND = 'lunch plan';
const HISTORY_COMMAND = '!history';
const PLAN_COMMAND = '!plan';
const VISITED_COMMAND = '!visited';
const ADD_LOCATION_COMMAND = '!addLocation';
const HELP_COMMAND = '!help';
const WHO_COMMAND = '!who';
const RANDOM_COMMAND = '!random';

const WHO_MESSAGE = 'YapBot v2.0 (powered by React/Nodemon)';
const MAX_CHARACTER_LIMIT = 1800;
const ROOT_API_URL = `http://yap-backend:${process.env.SERVER_PORT}`;

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
	if (message.author.bot) return false;

	const incomingMessage = message.content;

	console.log(`Message from ${message.author.username}: ${incomingMessage}`);

	if (incomingMessage == 'ping') {
		message.channel.send('Pong! :ping_pong:');
	} else if (
		incomingMessage.startsWith(LUNCH_PLAN_COMMAND) ||
		incomingMessage.startsWith(LOCATIONS_COMMAND) ||
		incomingMessage.startsWith(HISTORY_COMMAND) ||
		incomingMessage.startsWith(PLAN_COMMAND)
	) {
		const lunchResponse = await getVisits();

		if (lunchResponse.length == 0) {
			message.channel.send('There are no locations in **The Grand Lunch Plan**.');
		} else {
			let lunchSpotsMessage = '';

			const isLunchPlan = incomingMessage.startsWith(PLAN_COMMAND);

			let lunchLocationsCount = 0;

			const showVisits = incomingMessage.startsWith(LUNCH_PLAN_COMMAND) || incomingMessage.startsWith(LOCATIONS_COMMAND) || incomingMessage.startsWith(HISTORY_COMMAND);
			const showNonVisits = incomingMessage.startsWith(LUNCH_PLAN_COMMAND) || incomingMessage.startsWith(LOCATIONS_COMMAND) || incomingMessage.startsWith(PLAN_COMMAND);

			for (const lunchResult of lunchResponse) {
				if (lunchResult['visit_count'] > 0 && showVisits) {
					lunchSpotsMessage =
						lunchSpotsMessage + `• **${lunchResult['name']}** - Last Visit: ${lunchResult['time_ago_label']} (${lunchResult['visit_count']} total)\n`;
					lunchLocationsCount++;
				} else if (lunchResult['visit_count'] == 0 && showNonVisits) {
					const visitsLabel = isLunchPlan ? '' : ' - NO VISITS';
					lunchSpotsMessage = lunchSpotsMessage + `• **${lunchResult['name']}** ${visitsLabel}\n`;
					lunchLocationsCount++;
				}
			}

			if (incomingMessage.startsWith(LOCATIONS_COMMAND) || incomingMessage.startsWith(LUNCH_PLAN_COMMAND)) {
				message.channel.send("Here's all " + lunchLocationsCount + ' locations!');
			} else if (incomingMessage.startsWith(HISTORY_COMMAND)) {
				message.channel.send("Here's all " + lunchLocationsCount + ' latest visits!');
			} else if (incomingMessage.startsWith(PLAN_COMMAND)) {
				message.channel.send("Here's all " + lunchLocationsCount + ' locations you need to visit!');
			}

			sendMessageWithRateLimit(message.channel, lunchSpotsMessage);
		}
	} else if (incomingMessage.startsWith(`${VISITED_COMMAND} `)) {
		let location = incomingMessage.replace(`${VISITED_COMMAND} `, '').trim();

		let visitResponse = await visitLocation(location);

		if (visitResponse == undefined) {
			visitResponse = 'Response was empty from Penguinore. Look into this.';
		}

		message.channel.send(visitResponse);
	} else if (incomingMessage == RANDOM_COMMAND) {
		let randomResponse = await getRandom();

		if (randomResponse == undefined) {
			randomResponse = 'Response was empty from Penguinore. Look into this.';
		}

		message.channel.send(randomResponse);
	} else if (incomingMessage.startsWith(`${ADD_LOCATION_COMMAND} `)) {
		const author = message.author.username;
		let location = incomingMessage.replace(`${ADD_LOCATION_COMMAND} `, '').trim();

		let visitResponse = await addLocation(location, author);

		if (visitResponse == undefined) {
			visitResponse = 'Response was empty from Penguinore. Look into this.';
		}

		message.channel.send(visitResponse + ' It was added by **' + author + '**.');
	} else if (incomingMessage == WHO_COMMAND) {
		message.channel.send(WHO_MESSAGE);
	} else if (incomingMessage == HELP_COMMAND) {
		message.channel.send(
			'Yap is a lunch tracking tool that we use to determine where to go to lunch and which places we have not visited yet. YapBot will retrieve information from https://penguinore.net/lunch_yap/yap.php. It is meant to be a complete rip-off of Yelp but tailored more to us with less clutter and much less exploitation of small businesses.\n\n' +
				'**YapBot Commands:**\n' +
				`**${LOCATIONS_COMMAND}** or **${LUNCH_PLAN_COMMAND}** - Display visits and non-visits.\n` +
				`**${HISTORY_COMMAND}** - Display visited locations.\n` +
				`**${PLAN_COMMAND}** - Display locations that have not been visited.\n` +
				`**${RANDOM_COMMAND}** - Chooses a random place you have not been.\n` +
				`**${VISITED_COMMAND}** - Mark this location as visited today.\n` +
				`**${ADD_LOCATION_COMMAND} [location]** - Adds [location] to the lunch plan.\n` +
				`**${HELP_COMMAND}** - This command list.\n` +
				`**${WHO_COMMAND}** - Display version.`
		);
	}
});

function sendMessageWithRateLimit(channel, messageLeftToSend) {
	let messageToSend = '';

	while (messageLeftToSend.length > 0) {
		// Extract the line from the total
		const positionOfFirstNewline = messageLeftToSend.indexOf('\n') + 1; // Even though \n is two chars in code, it's ONE in the string
		const lineToAppend = messageLeftToSend.substring(0, positionOfFirstNewline);
		messageLeftToSend = messageLeftToSend.substring(positionOfFirstNewline);

		let lengthOfPossibleMessage = messageToSend.length + lineToAppend.length;

		// console.log(`Line to append [${lineToAppend}] with length [${lengthOfPossibleMessage}]` );

		if (lengthOfPossibleMessage > MAX_CHARACTER_LIMIT) {
			// Limit would be hit, just send what we got so far
			channel.send(messageToSend);

			// Our newest line becomes the first line in our next queued message
			messageToSend = lineToAppend;
		} else {
			// Our newest line is just added to the queued message
			messageToSend += lineToAppend;
		}
	}

	if (messageToSend.length > 0) {
		// Send whatever is left
		channel.send(messageToSend);
	}
}

async function getVisits() {
	const response = await fetch(`${ROOT_API_URL}/api/locations/plan`, {
		method: 'GET',
		headers: {
			// This is required. NodeJS server won't know how to read it without it.
			'Content-Type': 'application/json',
			botbypasstoken: process.env.DISCORD_CLIENT_TOKEN,
		},
	});

	return await response.json();
}

async function getRandom() {
	const response = await fetch(`${ROOT_API_URL}/api/locations/plan/random`, {
		method: 'GET',
		headers: {
			// This is required. NodeJS server won't know how to read it without it.
			'Content-Type': 'application/json',
			botbypasstoken: process.env.DISCORD_CLIENT_TOKEN,
		},
	});
	const json = await response.json();
	return json.message;
}

async function visitLocation(location) {
	const response = await fetch(`${ROOT_API_URL}/api/locations/addVisit`, {
		method: 'POST',
		body: JSON.stringify({
			name: location,
		}),
		headers: {
			// This is required. NodeJS server won't know how to read it without it.
			'Content-Type': 'application/json',
			botbypasstoken: process.env.DISCORD_CLIENT_TOKEN,
		},
	});
	const json = await response.json();
	return json.message;
}

async function addLocation(location, author) {
	const response = await fetch(`${ROOT_API_URL}/api/locations/quick`, {
		method: 'PUT',
		body: JSON.stringify({
			name: location,
			author,
		}),
		headers: {
			// This is required. NodeJS server won't know how to read it without it.
			'Content-Type': 'application/json',
			botbypasstoken: process.env.DISCORD_CLIENT_TOKEN,
		},
	});
	const json = await response.json();
	return json.message;
}

//make sure this line is the last line
client.login(process.env.DISCORD_CLIENT_TOKEN);
