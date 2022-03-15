import { SlashCommandBuilder } from "@discordjs/builders";
import { type CommandInteraction, GuildMember, type MessageComponentInteraction, Permissions, type ThreadChannel } from "discord.js";
import { shouldArchiveImmediately } from "../helpers/configHelpers";
import { interactionReply, getMessage, getThreadAuthor } from "../helpers/messageHelpers";
import { setEmojiForNewThread } from "../helpers/threadHelpers";
import type { atCommand } from "../types/atCommand";

export const command: atCommand = {
	name: "close",
	shortHelpDescription: "Closes a thread by setting the auto-archive duration to 1 hour",
	longHelpDescription: "The close command sets the auto-archive duration to 1 hour in a thread.\n\nWhen using auto-archive, the thread will automatically be archived when there have been no new messages in the thread for one hour. This can be undone by a server moderator by manually changing the auto-archive duration back to what it was previously, using Discord's own interface.",

	async getSlashCommandBuilder() {
		return new SlashCommandBuilder()
			.setName("close")
			.setDescription("Closes a thread by setting the auto-archive duration to 1 hour")
			.toJSON();
	},

	async execute(interaction: CommandInteraction | MessageComponentInteraction): Promise<void> {
		const member = interaction.member;
		if (!(member instanceof GuildMember)) {
			return interactionReply(interaction, getMessage("ERR_UNKNOWN", interaction.id));
		}

		const channel = interaction.channel;
		if (!channel?.isThread()) {
			return interactionReply(interaction, getMessage("ERR_ONLY_IN_THREAD", interaction.id));
		}

		// Invoking slash commands seem to unarchive the threads for now so ironically, this has no effect
		// Leaving this in if Discord decides to change their API around this
		if (channel.archived) {
			return interactionReply(interaction, getMessage("ERR_NO_EFFECT", interaction.id));
		}

		const hasManageThreadsPermissions = member.permissionsIn(channel).has(Permissions.FLAGS.MANAGE_THREADS, true);
		if (hasManageThreadsPermissions) {
			await archiveThread(channel);
			return;
		}

		const threadAuthor = await getThreadAuthor(channel);
		if (!threadAuthor) {
			return interactionReply(interaction, getMessage("ERR_AMBIGUOUS_THREAD_AUTHOR", interaction.id));
		}

		if (threadAuthor !== interaction.user) {
			return interactionReply(interaction, getMessage("ERR_ONLY_THREAD_OWNER", interaction.id));
		}

		await archiveThread(channel);

		async function archiveThread(thread: ThreadChannel): Promise<void> {
			if (shouldArchiveImmediately(thread)) {
				if (interaction.isButton()) {
					await interaction.update({ content: interaction.message.content });
					const message = getMessage("SUCCESS_THREAD_ARCHIVE_IMMEDIATE", interaction.id);
					if (message) {
						await thread.send(message);
					}
				}
				else if (interaction.isCommand()) {
					await interactionReply(interaction, getMessage("SUCCESS_THREAD_ARCHIVE_IMMEDIATE", interaction.id), false);
				}

				await setEmojiForNewThread(thread, false);
				await thread.setArchived(true);
				return;
			}

			if (thread.autoArchiveDuration === 60) {
				return interactionReply(interaction, getMessage("ERR_NO_EFFECT", interaction.id));
			}

			await setEmojiForNewThread(thread, false);
			await thread.setAutoArchiveDuration(60);

			if (interaction.isButton()) {
				await interaction.update({ content: interaction.message.content });
				const message = getMessage("SUCCESS_THREAD_ARCHIVE_SLOW", interaction.id);
				if (message) {
					await thread.send(message);
				}
			}
			else if (interaction.isCommand()) {
				await interactionReply(interaction, getMessage("SUCCESS_THREAD_ARCHIVE_SLOW", interaction.id), false);
			}
		}
	},
};
