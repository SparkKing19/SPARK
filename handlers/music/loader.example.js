// Merge the following pattern into your existing messageCreate handler.
// Do not register a second messageCreate listener if your bot already has one.
//
// const { setupMusic } = require('./handlers/music');
// const music = setupMusic(client);
//
// client.on('messageCreate', async message => {
//   // Keep your existing command handler if you have one.
//   const handled = await music.handleMessage(message, '%');
//   if (handled) return;
// });
