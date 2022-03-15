import { SlashCommandBuilder } from "@discordjs/builders";
import type { CommandInteraction, MessageComponentInteraction } from "discord.js";

export interface atCommand {
	name: string;
	shortHelpDescription: string;
	longHelpDescription?: string;
	getSlashCommandBuilder(): Promise<ReturnType<SlashCommandBuilder["toJSON"]>>;
	execute(interaction: CommandInteraction | MessageComponentInteraction): Promise<void>;
}
