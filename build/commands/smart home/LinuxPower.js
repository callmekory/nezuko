"use strict";
/*!
 * Coded by CallMeKory - https://github.com/callmekory
 * 'It’s not a bug – it’s an undocumented feature.'
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const unirest_1 = require("unirest");
const wol_1 = __importDefault(require("wol"));
const Command_1 = require("../../core/Command");
class LinuxPower extends Command_1.Command {
    constructor(client) {
        super(client, {
            name: 'pc',
            category: 'Smart Home',
            description: 'Linux system power control',
            usage: [`system gaara off`, `pc thinkboi reboot`],
            webUI: true,
            args: true
        });
    }
    // TODO add linuxpower typings
    async run(client, msg, args, api) {
        // * ------------------ Setup --------------------
        const { Utils, Log } = client;
        const { errorMessage, validOptions, standardMessage, embed, capitalize } = Utils;
        const { channel } = msg;
        // * ------------------ Config --------------------
        const devices = client.db.config.systemPowerControl;
        // * ------------------ Logic --------------------
        const sendCommand = async (device, command) => {
            const { host, mac, name } = device;
            const options = ['reboot', 'off', 'on'];
            if (!options.includes(command)) {
                if (api)
                    return `Valid commands are [ ${options.join(', ')} ]`;
                await validOptions(msg, options);
            }
            else {
                switch (command) {
                    case 'reboot':
                    case 'off': {
                        try {
                            const response = await unirest_1.post(host)
                                .headers({ 'Content-Type': 'application/json' })
                                .send({ command });
                            const statusCode = response.status;
                            if (statusCode === 200) {
                                const text = command === 'reboot' ? 'reboot' : 'power off';
                                if (api)
                                    return `Told [ ${capitalize(name)} ] to [ ${text} ]`;
                                return standardMessage(msg, `:desktop: Told [ ${capitalize(name)} ] to [ ${text}] `);
                            }
                        }
                        catch (e) {
                            if (api)
                                return `Failed to connect to ${capitalize(name)}`;
                            Log.error('System Power Control', `Failed to connect to [ ${capitalize(name)} ]`, e);
                            await errorMessage(msg, `Failed to connect to [ ${capitalize(name)} ]`);
                        }
                    }
                    case 'on': {
                        await wol_1.default.wake(mac);
                        if (api)
                            return `Sent WOL to [ ${capitalize(name)} ]`;
                        return standardMessage(msg, `:desktop: Sent WOL to [ ${capitalize(name)} ]`);
                    }
                }
            }
        };
        // * ------------------ Usage Logic --------------------
        switch (args[0]) {
            case 'list': {
                // Todo add listing functionality
                return channel.send(embed('green'));
            }
            default: {
                const system = args[0];
                const command = args[1];
                const index = devices.findIndex((d) => d.name === system);
                const host = devices[index];
                return sendCommand(host, command);
            }
        }
    }
}
exports.default = LinuxPower;
