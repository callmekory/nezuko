"use strict";
/*!
 * Coded by CallMeKory - https://github.com/callmekory
 * 'It’s not a bug – it’s an undocumented feature.'
 */
Object.defineProperty(exports, "__esModule", { value: true });
const main_1 = require("../main");
main_1.client.on('guildMemberAdd', async (member) => {
    const { serverConfig, Utils } = main_1.client;
    const { embed } = Utils;
    const db = await serverConfig.findOne({ where: { id: member.guild.id } });
    const { welcomeChannel, prefix } = JSON.parse(db.dataValues.config);
    const e = embed()
        .setColor('RANDOM')
        .setThumbnail(member.guild.iconURL)
        .setAuthor(member.user.username, member.user.avatarURL)
        .setTitle(`Welcome To ${member.guild.name}!`)
        .setDescription(`Please take a look at our rules by typing **${prefix}rules**!\nView our commands with **${prefix}help**\nEnjoy your stay!`);
    const channel = member.guild.channels.get(welcomeChannel);
    return channel.send(e);
});
