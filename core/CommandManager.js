const { Client } = require('discord.js')
const Enmap = require('enmap')
const messageLogging = require('../core/utils/messageLogging')
const Database = require('./Database')

module.exports = class CommandManager {
  constructor(client) {
    this.client = client
    this.commands = new Enmap()
    this.aliases = new Enmap()
    this.prefix = '?'
    this.ownerID = client.config.ownerID

    if (!this.client || !(this.client instanceof Client)) {
      throw new Error('Discord Client is required')
    }
  }

  loadCommands(directory) {
    const cmdFiles = this.client.Utils.findNested(directory, '.js')
    cmdFiles.forEach((file) => {
      this.startModule(file)
    })
  }

  startModule(location) {
    const Command = require(location)
    const instance = new Command(this.client)
    const commandName = instance.name.toLowerCase()
    instance.location = location

    if (instance.disabled) return
    if (this.commands.has(commandName)) {
      this.client.Log.error('Start Module', `"${commandName}" already exists!`)
      throw new Error('Commands cannot have the same name')
    }

    this.commands.set(commandName, instance)

    for (const alias of instance.aliases) {
      if (this.aliases.has(alias)) {
        throw new Error(`Commands cannot share aliases: ${instance.name} has ${alias}`)
      } else {
        this.aliases.set(alias, instance)
      }
    }
  }

  reloadCommands() {
    this.Log.warn('Reload Manager', 'Clearing Module Cache')
    this.commands = new Enmap()
    this.aliases = new Enmap()

    this.Log.warn('Reload Manager', 'Reinitialising Modules')
    this.loadCommands('./commands')

    this.Log.success('Reload Manager', 'Reload Commands Success')
    return true
  }

  reloadCommand(commandName) {
    const existingCommand = this.commands.get(commandName) || this.aliases.get(commandName)
    if (!existingCommand) return false
    const { location } = existingCommand
    for (const alias of existingCommand.aliases) this.aliases.delete(alias)
    this.commands.delete(commandName)
    delete require.cache[require.resolve(location)]
    this.startModule(location, true)
    return true
  }

  async runCommand(client, command, msg, args, api = false) {
    try {
      msg.channel.startTyping()
      await command.run(client, msg, args, api)
      client.Log.info(
        'Command Parser',
        `${msg.author.tag} ran command [${command.name} ${args.join(' ')}]`
      )
      return msg.channel.stopTyping()
    } catch (err) {
      msg.channel.stopTyping()
      return client.Utils.error(command.name, err, msg.channel)
    }
  }

  findCommand(commandName) {
    return this.commands.get(commandName) || this.aliases.get(commandName)
  }

  async handleMessage(msg, client) {
    // assign variables
    msg.context = this

    // set db configs
    const generalConfig = await Database.Models.generalConfig.findOne({
      where: { id: client.config.ownerID }
    })
    client.settings = generalConfig.dataValues

    const { content, author } = msg
    const prefix = msg.guild ? await this.handleServer(msg.guild) : this.prefix
    this.prefix = prefix
    msg.prefix = prefix
    const { Utils, colors, Log } = client

    // reply with prefix when bot is the only thing mentioned
    if (msg.isMentioned(client.user) && msg.content.split(' ').length === 1) {
      await msg.delete()
      const m = await msg.reply(
        Utils.embed(msg, 'green').setDescription(`Waddup my G. My command prefix is **${prefix}**`)
      )
      return m.delete(10000)
    }

    // if msg is sent by bot then ignore
    if (author.bot) return

    // send all messages to our Log
    await messageLogging(client, msg)

    // if msg doesnt start with prefix then ignore msg
    if (!content.startsWith(prefix) || content.length < 2) return

    // anything after command becomes a list of args
    const args = content.slice(prefix.length).split(/ +/)

    // command name without prefix
    const commandName = args.shift().toLowerCase()

    // set command name and aliases
    const instance = this.findCommand(commandName)

    // if no command or alias do nothing
    if (!instance) {
      const m = await msg.channel.send(
        Utils.embed(msg, 'green')
          .setColor(colors.red)
          .setDescription(`No command: **${commandName}**`)
      )
      return m.delete(10000)
    }

    const command = instance
    msg.command = instance.commandName

    // Check if command is enabled
    if (command.disabled) return

    // if command is marked 'ownerOnly: true' then don't excecute
    if (command.ownerOnly && author.id !== this.ownerID) {
      Log.warn(
        'Command Parser',
        `${author.tag} tried to run ownerOnly command [${command.name} ${
          args.length ? args.join(' ') : ''
        }]`
      )
      return
    }

    // if command is marked 'guildOnly: true' then don't excecute
    if (command.guildOnly && msg.channel.type === 'dm') {
      Log.warn(
        'Command Parser',
        `${author.tag} tried to run [${command.name} ${args.length ? args.join(' ') : ''}] in a DM`
      )
      return msg.reply(
        Utils.embed(msg, 'green')
          .setColor(colors.yellow)
          .setDescription('This command cannot be slid into my DM.')
      )
    }

    // check if user and bot has all required perms in permsNeeded
    if (msg.channel.type !== 'dm') {
      if (command.permsNeeded) {
        const userMissingPerms = this.checkPerms(msg.member, command.permsNeeded)
        const botMissingPerms = this.checkPerms(msg.guild.me, command.permsNeeded)

        if (userMissingPerms) {
          const m = await msg.reply(
            Utils.embed(msg, 'red')
              .setTitle('You lack the perms')
              .setDescription(`**- ${userMissingPerms.join('\n - ')}**`)
          )
          return m.delete(20000)
        }

        if (botMissingPerms) {
          const m = await msg.channel.send(
            Utils.embed(msg, 'red')
              .setTitle('I lack the perms needed to perform that action')
              .setDescription(`**- ${botMissingPerms.join('\n - ')}**`)
          )

          return m.delete(30000)
        }
      }
    }

    // if commands is marked 'args: true' run this if no args sent
    if (command.args && !args.length) {
      const embed = Utils.embed(msg, 'yellow')
        .setTitle("You didn't provide any arguments")
        .setDescription('Edit your last message with the correct params')
        .addField('**Example Usage**', `\`\`\`css\n${command.usage.replace(/ \| /g, '\n')}\`\`\``)
      const m = await msg.reply({ embed })
      return m.delete(30000)
    }

    // Run Command
    return this.runCommand(client, command, msg, args)
  }

  async handleServer(guild) {
    const { id, ownerID, name, owner } = guild
    // setup DB

    const generalConfig = await Database.Models.generalConfig.findOne({
      where: { id: this.ownerID }
    })

    if (!generalConfig) {
      await Database.Models.generalConfig.create({
        username: owner.user.tag,
        id: ownerID,
        pihole: JSON.stringify({ host: null, apiKey: null }),
        rclone: JSON.stringify({ remote: null }),
        emby: JSON.stringify({ host: null, apiKey: null, userID: null }),
        docker: JSON.stringify({ host: null }),
        sengled: JSON.stringify({ username: null, password: null, jsessionid: null }),
        googleHome: JSON.stringify({ name: null, ip: null, language: null }),
        transmission: JSON.stringify({ host: null, apiKey: null, ssl: false }),
        sabnzbd: JSON.stringify({ host: null, apiKey: null }),
        ombi: JSON.stringify({ host: null, apiKey: null, username: null }),
        meraki: JSON.stringify({ serielNum: null, apiKey: null }),
        pioneerAVR: JSON.stringify({ host: null }),
        systemPowerControl: JSON.stringify([]),
        tuyaPlugControl: JSON.stringify([])
      })
    }

    // per server config
    if (!guild) return { prefix: this.prefix }

    let db = await Database.Models.serverConfig.findOne({ where: { id } })

    if (!db) {
      db = await Database.Models.serverConfig.create({
        serverName: name,
        id,
        prefix: '?',
        ownerID,
        welcomeChannel: null,
        logsChannel: null,
        starboardChannel: null,
        rules: JSON.stringify([])
      })
    }
    const prefix = db.prefix || this.prefix
    return prefix
  }

  checkPerms(user, permsNeeded) {
    const missingPerms = []
    for (const perm of permsNeeded) {
      if (!user.permissions.has(perm)) missingPerms.push(perm)
    }
    if (missingPerms.length) return missingPerms
    return false
  }
}