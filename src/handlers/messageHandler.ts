import { type Message, MessageActionRow, MessageButton, NewsChannel, TextChannel, ThreadChannel, SnowflakeUtil, type Snowflake, Permissions } from "discord.js";
import { emojisEnabled, getConfig, includeBotsForAutothread, getSlowmodeSeconds } from "../helpers/configHelpers";
import { getMessage, resetMessageContext, addMessageContext, isAutoThreadChannel, getHelpButton, replaceMessageVariables, getThreadAuthor } from "../helpers/messageHelpers";
import { getRequiredPermissions, getSafeDefaultAutoArchiveDuration } from "../helpers/permissionHelpers";

export async function handleMessageCreate(message: Message): Promise<void> {
	// Server outage
	if (!message.guild?.available) return;

	// Not logged in
	if (message.client.user === null) return;

	if (message.system) return;
	if (!message.channel.isText()) return;
	if (!message.inGuild()) return;
	if (message.author.id === message.client.user.id) return;

	const includeBots = includeBotsForAutothread(message.guild.id, message.channel.id);
	if (!includeBots && message.author.bot) return;

	if (!message.author.bot && message.channel.isThread()) {
		await updateTitle(message.channel, message);
		return;
	}

	const requestId = SnowflakeUtil.generate();
	await autoCreateThread(message, requestId);
	resetMessageContext(requestId);
}

async function updateTitle(thread: ThreadChannel, message: Message) {
	if (message.author.bot) return;

	const threadAuthor = await getThreadAuthor(thread);
	if (message.author == threadAuthor) return;

	await thread.setName(thread.name.replace("🆕", ""));
}

async function autoCreateThread(message: Message, requestId: Snowflake) {
	// Server outage
	if (!message.guild?.available) return;

	// Not logged in
	if (message.client.user === null) return;

	const authorUser = message.author;
	const authorMember = message.member;
	const guild = message.guild;
	const channel = message.channel;

	if (!(channel instanceof TextChannel) && !(channel instanceof NewsChannel)) return;
	if (message.hasThread) return;
	if (!isAutoThreadChannel(channel.id, guild.id)) return;

	const slowmode = getSlowmodeSeconds(guild.id, channel.id);

	const botMember = await guild.members.fetch(message.client.user);
	const botPermissions = botMember.permissionsIn(message.channel.id);
	const requiredPermissions = getRequiredPermissions(slowmode);
	if (!botPermissions.has(requiredPermissions)) {
		try {
			const missing = botPermissions.missing(requiredPermissions);
			const errorMessage = `Missing permission${missing.length > 1 ? "s" : ""}:`;
			await message.channel.send(`${errorMessage}\n    - ${missing.join("\n    - ")}`);
		}
		catch (e) {
			console.log(e);
		}
		return;
	}

	addMessageContext(requestId, {
		user: authorUser,
		channel: channel,
		message: message,
	});

	const creationDate = message.createdAt.toISOString().slice(0, 10);
	const messagetitle = message.content.slice(0, 80);
	const authorName = authorMember === null || authorMember.nickname === null
		? authorUser.username
		: authorMember.nickname;

	const name = emojisEnabled(guild)
		? `🆕 ${messagetitle} (${creationDate})`
		: `${messagetitle} (${creationDate})`;

	const thread = await message.startThread({
		name,
		rateLimitPerUser: slowmode,
		autoArchiveDuration: getSafeDefaultAutoArchiveDuration(channel),
	});

	const closeButton = new MessageButton()
		.setCustomId("close")
		.setLabel("Archive thread")
		.setStyle("SUCCESS")
		.setEmoji("937932140014866492"); // :archive:

	const helpButton = getHelpButton();

	const buttonRow = new MessageActionRow().addComponents(closeButton, helpButton);

	const overrideMessageContent = getConfig(guild.id).threadChannels?.find(x => x?.channelId === channel.id)?.messageContent;
	const msgContent = overrideMessageContent
		? replaceMessageVariables(overrideMessageContent, requestId)
		: getMessage("SUCCESS_THREAD_CREATE", requestId);

	if (msgContent && msgContent.length > 0) {
		const msg = await thread.send({
			content: msgContent,
			components: [buttonRow],

		});

		if (botMember.permissionsIn(thread.id).has(Permissions.FLAGS.MANAGE_MESSAGES)) {
			await msg.pin();
			await thread.lastMessage?.delete();
		}
	}

	const { IncomingWebhook } = require('@slack/webhook');
	// Read a url from the environment variables
	const url = process.env.SLACK_WEBHOOK_URL;
	// Initialize
	const webhook = new IncomingWebhook(url);


	(async () => {
		await webhook.send({
		  text: `"New Thread Made In" ${channel} "with the title" ${messagetitle} "at" (${creationDate})`,
		});
	})();

	resetMessageContext(requestId);
}
