const Command = require('../../core/Command')

module.exports = class Rules extends Command {
  constructor(client) {
    super(client, {
      name: 'rules',
      category: 'General',
      description: 'Behold the rule book.'
    })
  }

  async run(client, msg, args) {
    // * ------------------ Setup --------------------

    const { Utils, serverConfig } = client
    const { warningMessage, standardMessage, embed } = Utils
    const { member, guild } = msg

    // * ------------------ Check Config --------------------

    if (args[0]) {
      if (!member.permissions.has(['ADMINISTRATOR'])) {
        return warningMessage(msg, `You must have ['ADMINISTRATOR'] perms to ${args[0]} rules`)
      }
    }

    // * ------------------ Logic --------------------

    const rule = args.slice(1).join(' ')

    const db = await serverConfig.findOne({ where: { id: guild.id } })
    const { rules, logsChannel, prefix } = client.db.server

    const serverLogsChannel = msg.guild.channels.get(logsChannel)

    if (!serverLogsChannel) {
      return warningMessage(
        msg,
        `It appears that you do not have a logs channel.
        Please set one with \`${prefix}server set logsChannel <channelID>\``
      )
    }

    switch (args[0]) {
      case 'add': {
        rules.push(rule)
        await db.update({ rules: JSON.stringify(rules) })
        return standardMessage(msg, `${rule}\n\nAdded to rules`)
      }
      case 'remove': {
        const item = args[1] - 1
        const name = rules[item]
        rules.splice(item, 1)
        await db.update({ rules: JSON.stringify(rules) })
        if (name) return standardMessage(msg, `${name}\n\nRemoved from rules`)

        return warningMessage(msg, `Rule does not exist`)
      }
      default: {
        if (!rules.length) {
          return msg.reply(
            embed(msg, 'yellow')
              .setTitle(`There are no rules!`)
              .setDescription(`\`${prefix}rules add <rule to add>\`\nTo add some!`)
          )
        }

        let ruleList = ''
        rules.forEach((i, index) => {
          ruleList += `${index + 1} | ${i}\n`
        })
        return msg.reply(
          embed(msg)
            .setTitle('Rules')
            .setDescription(ruleList)
        )
      }
    }
  }
}