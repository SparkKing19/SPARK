let isFeatureEnabled;
try {
    isFeatureEnabled = require('../../utils/featureCheck').isFeatureEnabled;
} catch (_) {
    isFeatureEnabled = async () => true;
}

let GuildConfig, Music247, CustomPlaylist;
try { GuildConfig = require('../../models/guildConfig'); } catch (_) { GuildConfig = null; }
try { Music247 = require('../../models/music247'); } catch (_) { 
    try { Music247 = require('../../models/music'); } catch (_) { Music247 = null; }
}
try { CustomPlaylist = require('../../models/customPlaylist'); } catch (_) { CustomPlaylist = null; }

const SongDispatcher = require('./dispatcher');
const { getPanelEmbed, getPanelComponents, updateVoiceStatus } = require('./panel');
const { EmbedBuilder } = require('discord.js');

const BOT_OWNERS = [
    '1549995551288852584', // FOUZAN
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

function setupMusic(client) {
    client.musicQueue = new Map();

    // Interaction Listener for Panel Buttons & Filters
    client.on('interactionCreate', async (interaction) => {
        if (interaction.guild && !(await isFeatureEnabled(interaction.guild.id, 'music'))) return;
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('btn_') && interaction.customId !== 'menu_filters') return;

        const dispatcher = client.musicQueue.get(interaction.guildId);
        if (!dispatcher || !dispatcher.current) {
            return interaction.reply({ content: '❌ No active audio stream.', flags: 64 });
        }

        if (!interaction.member.voice?.channel || interaction.member.voice.channel.id !== dispatcher.player.connection.channelId) {
            return interaction.reply({ content: `❌ You must be in <#${dispatcher.player.connection.channelId}> to control playback.`, flags: 64 });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_filters') {
            await interaction.deferUpdate();
            dispatcher.setFilter(interaction.values[0]);
            return;
        }

        const id = interaction.customId;

        if (id === 'btn_pause') {
            await dispatcher.player.setPaused(true);
            await dispatcher.updatePanel();
            return interaction.reply({ content: '⏸️ Paused playback.', flags: 64 });
        }
        if (id === 'btn_resume') {
            await dispatcher.player.setPaused(false);
            await dispatcher.updatePanel();
            return interaction.reply({ content: '▶️ Resumed playback.', flags: 64 });
        }
        if (id === 'btn_next') {
            await dispatcher.player.stopTrack();
            return interaction.reply({ content: '⏭️ Skipped track.', flags: 64 });
        }
        if (id === 'btn_previous') {
            if (!dispatcher.previous) return interaction.reply({ content: '❌ No previous track found.', flags: 64 });
            dispatcher.queue.unshift(dispatcher.previous);
            await dispatcher.player.stopTrack();
            return interaction.reply({ content: `⏮️ Playing previous track: **${dispatcher.previous.info.title}**`, flags: 64 });
        }
        if (id === 'btn_stop') {
            dispatcher.destroy();
            await updateVoiceStatus(client, interaction.member.voice.channel.id, '');
            await dispatcher.updatePanel();
            return interaction.reply({ content: '🛑 Playback terminated.', flags: 64 });
        }
        if (id === 'btn_loop_track') {
            dispatcher.loop = dispatcher.loop === 'TRACK' ? 'NONE' : 'TRACK';
            await dispatcher.updatePanel();
            return interaction.reply({ content: `♾️ Loop track: **${dispatcher.loop === 'TRACK' ? 'Enabled' : 'Disabled'}**`, flags: 64 });
        }
        if (id === 'btn_autoplay') {
            dispatcher.autoplay = !dispatcher.autoplay;
            await dispatcher.updatePanel();
            return interaction.reply({ content: `🔁 Autoplay: **${dispatcher.autoplay ? 'Enabled' : 'Disabled'}**`, flags: 64 });
        }
        if (id === 'btn_volup') {
            const vol = Math.min((dispatcher.player.volume || 100) + 10, 150);
            await dispatcher.player.setVolume(vol);
            return interaction.reply({ content: `🔊 Volume: **${vol}%**`, flags: 64 });
        }
        if (id === 'btn_voldown') {
            const vol = Math.max((dispatcher.player.volume || 100) - 10, 10);
            await dispatcher.player.setVolume(vol);
            return interaction.reply({ content: `🔉 Volume: **${vol}%**`, flags: 64 });
        }
        if (id === 'btn_save_playlist') {
            if (CustomPlaylist) {
                await CustomPlaylist.findOneAndUpdate(
                    { userId: interaction.user.id, name: 'Favorites' },
                    {
                        $addToSet: {
                            tracks: {
                                title: dispatcher.current.info.title,
                                uri: dispatcher.current.info.uri,
                                author: dispatcher.current.info.author,
                                length: dispatcher.current.info.length
                            }
                        }
                    },
                    { upsert: true }
                ).catch(() => {});
            }
            return interaction.reply({ content: `💾 Added **${dispatcher.current.info.title}** to Favorites!`, flags: 64 });
        }
    });

    client.on('voiceStateUpdate', async (oldState, newState) => {
        const guildId = oldState.guild.id || newState.guild.id;
        const dispatcher = client.musicQueue.get(guildId);
        if (!dispatcher) return;

        const channel = oldState.guild.channels.cache.get(dispatcher.player.connection.channelId);
        if (!channel) return;

        const humans = channel.members.filter(m => !m.user.bot);
        if (humans.size === 0) {
            await updateVoiceStatus(client, channel.id, '');
            const rec247 = Music247 ? await Music247.findOne({ guildId, enabled: true }).catch(() => null) : null;
            if (!rec247) {
                dispatcher.destroy();
            }
        }
    });

    return {
        async handleMessage(message, prefix) {
            if (message.guild && !(await isFeatureEnabled(message.guild.id, 'music'))) return false;
            if (message.author.bot || !message.guild) return false;
            if (!message.content.startsWith(prefix)) return false;

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const cmd = args.shift()?.toLowerCase();

            const musicCommands = ['play', 'p', 'stop', 'skip', 's', 'join', '24/7', '247', 'setup', 'music', 'playlist'];
            if (!musicCommands.includes(cmd)) return false;

            // %setup / %music panel
            if (cmd === 'setup' || (cmd === 'music' && args[0]?.toLowerCase() === 'panel')) {
                const isOwner = message.guild.ownerId === message.author.id;
                const isAdmin = message.member.permissions.has('Administrator');
                const conf = GuildConfig ? await GuildConfig.findOne({ guildId: message.guild.id }).catch(() => null) : null;
                const isExtraOwner = conf?.extraOwners?.includes(message.author.id);

                if (!BOT_OWNERS.includes(message.author.id) && !isOwner && !isAdmin && !isExtraOwner) {
                    message.reply('❌ Only Server Owners, Admins, or Extra Owners can setup the panel.');
                    return true;
                }

                const embed = getPanelEmbed(client, null, null);
                const components = getPanelComponents(null);
                const panelMsg = await message.channel.send({ embeds: [embed], components });

                if (GuildConfig) {
                    await GuildConfig.findOneAndUpdate(
                        { guildId: message.guild.id },
                        { panelChannelId: message.channel.id, panelMessageId: panelMsg.id },
                        { upsert: true }
                    ).catch(() => {});
                }

                message.reply(`✅ Control Panel successfully deployed in <#${message.channel.id}>!`);
                return true;
            }

            // %join
            if (cmd === 'join') {
                const vc = message.member.voice.channel;
                if (!vc) {
                    message.reply('❌ You must join a voice channel first.');
                    return true;
                }

                if (!client.shoukaku) {
                    message.reply('❌ Shoukaku is not initialized.');
                    return true;
                }

                let dispatcher = client.musicQueue.get(message.guild.id);
                if (!dispatcher) {
                    const player = await client.shoukaku.joinVoiceChannel({
                        guildId: message.guild.id,
                        channelId: vc.id,
                        shardId: 0,
                        deaf: true
                    });
                    dispatcher = new SongDispatcher(client, player, message.channel, message.guild.id);
                    client.musicQueue.set(message.guild.id, dispatcher);
                }
                message.reply(`🔊 Connected to <#${vc.id}>.`);
                return true;
            }

            // %play
            if (cmd === 'play' || cmd === 'p') {
                const vc = message.member.voice.channel;
                if (!vc) {
                    message.reply('❌ Please join a voice channel first.');
                    return true;
                }

                const query = args.join(' ').trim();
                if (!query) {
                    message.reply('❌ Enter a song name: `%play <song name>`');
                    return true;
                }

                if (!client.shoukaku) {
                    message.reply('❌ Lavalink client is not connected.');
                    return true;
                }

                const node = client.shoukaku.getIdealNode();
                if (!node) {
                    message.reply('❌ Lavalink node is currently offline.');
                    return true;
                }

                const statusMsg = await message.reply('🔍 Searching track...');

                let dispatcher = client.musicQueue.get(message.guild.id);
                if (!dispatcher) {
                    const player = await client.shoukaku.joinVoiceChannel({
                        guildId: message.guild.id,
                        channelId: vc.id,
                        shardId: 0,
                        deaf: true
                    });
                    dispatcher = new SongDispatcher(client, player, message.channel, message.guild.id);
                    client.musicQueue.set(message.guild.id, dispatcher);
                }

                try {
                    let result = null;
                    if (/^https?:\/\//i.test(query)) {
                        result = await node.rest.resolve(query);
                    } else {
                        result = await node.rest.resolve(`scsearch:${query}`);
                        if (!result?.data || (Array.isArray(result.data) && !result.data.length)) {
                            result = await node.rest.resolve(`ytmsearch:${query}`);
                        }
                    }

                    if (!result || !result.data || (Array.isArray(result.data) && !result.data.length)) {
                        return statusMsg.edit(`❌ Audio not found for: **${query}**`);
                    }

                    if (result.loadType === 'playlist') {
                        for (const t of result.data.tracks) {
                            t.info.requester = message.author;
                            dispatcher.queue.push(t);
                        }
                        if (!dispatcher.current) dispatcher.play();
                        return statusMsg.edit(`🎶 Added playlist **${result.data.info.name}** (\`${result.data.tracks.length}\` tracks) to queue.`);
                    }

                    const track = Array.isArray(result.data) ? result.data[0] : result.data;
                    track.info.requester = message.author;
                    dispatcher.queue.push(track);

                    if (!dispatcher.current) {
                        dispatcher.play();
                        return statusMsg.edit(`🎶 Now playing: **${track.info.title}**`);
                    } else {
                        return statusMsg.edit(`✅ Added to queue: **${track.info.title}**`);
                    }
                } catch (err) {
                    console.error('Play command error:', err);
                    return statusMsg.edit(`❌ Playback error: \`${err.message}\``);
                }
            }

            // %stop
            if (cmd === 'stop') {
                const dispatcher = client.musicQueue.get(message.guild.id);
                if (!dispatcher) {
                    message.reply('❌ Bot is not active.');
                    return true;
                }

                dispatcher.destroy();
                await updateVoiceStatus(client, message.member.voice?.channel?.id, '');
                message.reply('🛑 Playback stopped.');
                return true;
            }

            // %skip
            if (cmd === 'skip' || cmd === 's') {
                const dispatcher = client.musicQueue.get(message.guild.id);
                if (!dispatcher || !dispatcher.current) {
                    message.reply('❌ Nothing is playing.');
                    return true;
                }

                await dispatcher.player.stopTrack();
                message.reply('⏭️ Track skipped.');
                return true;
            }

            // %24/7
            if (cmd === '24/7' || cmd === '247') {
                const isOwner = message.guild.ownerId === message.author.id;
                const isAdmin = message.member.permissions.has('Administrator');
                if (!BOT_OWNERS.includes(message.author.id) && !isOwner && !isAdmin) {
                    message.reply('Only server owners/admins can configure 24/7 mode.');
                    return true;
                }

                const vc = message.member.voice.channel;
                if (!vc) {
                    message.reply('❌ Join the specific voice channel you want as 24/7 home.');
                    return true;
                }

                if (Music247) {
                    const existing = await Music247.findOne({ guildId: message.guild.id, enabled: true });
                    if (existing) {
                        await Music247.findOneAndUpdate({ guildId: message.guild.id }, { enabled: false });
                        message.reply('🔓 **24/7 Mode Disabled!**');
                    } else {
                        await Music247.findOneAndUpdate(
                            { guildId: message.guild.id },
                            { voiceChannelId: vc.id, textChannelId: message.channel.id, enabled: true },
                            { upsert: true }
                        );
                        message.reply(`🔒 **24/7 Mode Active!** Home channel: <#${vc.id}>.`);
                    }
                } else {
                    message.reply('🔒 **24/7 Mode Active!**');
                }
                return true;
            }

            // %playlist
            if (cmd === 'playlist') {
                const sub = args[0]?.toLowerCase();
                if (sub === 'create') {
                    const name = args.slice(1).join(' ').trim();
                    if (!name) {
                        message.reply('❌ Usage: `%playlist create <name>`');
                        return true;
                    }

                    if (CustomPlaylist) {
                        await CustomPlaylist.findOneAndUpdate(
                            { userId: message.author.id, name },
                            { tracks: [], recording: true },
                            { upsert: true }
                        );
                    }
                    message.reply(`💾 Playlist **${name}** created! The next 10 songs played will be saved automatically.`);
                    return true;
                } else if (sub) {
                    const name = args.join(' ').trim();
                    const pl = CustomPlaylist ? await CustomPlaylist.findOne({ userId: message.author.id, name }) : null;
                    if (!pl || !pl.tracks.length) {
                        message.reply(`❌ No playlist found with name: **${name}**`);
                        return true;
                    }

                    const vc = message.member.voice.channel;
                    if (!vc) {
                        message.reply('❌ Connect to a voice channel first.');
                        return true;
                    }

                    const node = client.shoukaku?.getIdealNode();
                    if (!node) {
                        message.reply('❌ Lavalink node offline.');
                        return true;
                    }

                    let dispatcher = client.musicQueue.get(message.guild.id);
                    if (!dispatcher) {
                        const player = await client.shoukaku.joinVoiceChannel({
                            guildId: message.guild.id,
                            channelId: vc.id,
                            shardId: 0,
                            deaf: true
                        });
                        dispatcher = new SongDispatcher(client, player, message.channel, message.guild.id);
                        client.musicQueue.set(message.guild.id, dispatcher);
                    }

                    for (const item of pl.tracks) {
                        const res = await node.rest.resolve(item.uri || `scsearch:${item.title}`).catch(() => null);
                        const track = Array.isArray(res?.data) ? res.data[0] : res?.data;
                        if (track) {
                            track.info.requester = message.author;
                            dispatcher.queue.push(track);
                        }
                    }

                    if (!dispatcher.current) dispatcher.play();
                    message.reply(`🎶 Loaded playlist **${name}** (\`${pl.tracks.length}\` tracks) into queue!`);
                    return true;
                }
            }

            return false;
        }
    };
}

module.exports = { setupMusic };
                
