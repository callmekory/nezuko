const express = require('express')
const chalk = require('chalk')
const cors = require('cors')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const shortid = require('shortid')
const Subprocess = require('../../Subprocess')
const { Manager } = require('../../../events/message')

class WebServer extends Subprocess {
  constructor(client) {
    super(client, {
      name: 'Web Server',
      description: 'Web Server'
    })
  }

  async run() {
    shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-@')
    /**
     * example API usage
     *  {
     *      "command": "<command> <params>"
     *  }
     */

    const { webServerPort } = this.client.config
    const { Log } = this.client

    const app = express()
    app.use(express.json())
    app.use(
      cors({
        credentials: true,
        origin: ['http://127.0.0.1:3000']
      })
    )
    app.use(express.static(`${__dirname}/app/build`))

    app.get('/ui/db', (req, res) => {
      const adapter = new FileSync('./data/db.json')
      const db = low(adapter)
      const data = {
        uiButtons: db.get('uiButtons')
      }
      return res.status(200).json(data)
    })
    app.post('/ui/db', (req, res) => {
      const adapter = new FileSync('./data/db.json')
      const db = low(adapter)

      if (req.body[0] && req.body[1]) {
        db.get('uiButtons')
          .push({ id: shortid.generate(), name: req.body[0], command: req.body[1] })
          .write()
      }
    })

    app.post('/ui/db/rm/:id', (req, res) => {
      const adapter = new FileSync('./data/db.json')
      const db = low(adapter)
      db.get(`uiButtons`)
        .remove({ id: req.params.id })
        .write()
      return res.status(200)
    })

    app.get('/api/info', (req, res) => {
      const upTime = this.client.Utils.millisecondsToTime(this.client.uptime)
      const data = {
        username: this.client.user.username,
        id: this.client.user.id,
        avatarId: this.client.user.avatar,
        status: this.client.status,
        upTime,
        presence: this.client.user.localPresence.game,
        avatar: this.client.user.avatarURL
      }
      return res.status(200).json(data)
    })

    app.get('/', (req, res) => {
      res.sendFile('/index.html')
    })

    app.post('/api/commands', async (req, res) => {
      Log.info(
        chalk.green(`${chalk.yellow(req.ip)} sent command ${chalk.yellow(req.body.command)}`)
      )

      // check if all required params are met
      if (!req.body.command) {
        res.status(406).json({ response: "Missing params 'command'" })
      }

      // anything after command becomes a list of args
      const args = req.body.command.split(/ +/)
      // command name without prefix
      const cmdName = args.shift().toLowerCase()
      const cmd = Manager.findCommand(cmdName)
      // if command exists
      if (cmd) {
        // Check if command is enabled
        if (cmd.disabled) {
          return res.status(403).json({ response: 'Command is disabled bot wide.' })
        }
        if (!cmd.webUI) {
          // check if command is enabled in API
          return res.status(403).json({ response: 'Command is disabled for use in the API.' })
        }
        const response = await Manager.runCommand(this.client, cmd, null, args, true)
        return res.status(200).json({ response })
      }
      return res.status(406).json({ response: `Command '${req.body.command}' not found.` })
    })
    try {
      app.listen(webServerPort, () => {
        Log.info(`Web Server Up`, `Listening on port ${webServerPort}`)
      })
    } catch (e) {
      Log.warn(e)
    }
  }
}
module.exports = WebServer