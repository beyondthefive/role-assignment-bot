const Discord = require('discord.js');
require('dotenv').config();
const config = require('./config.js');
const Airtable = require('airtable');
const base = new Airtable({apiKey: process.env.API_KEY}).base(
	'apprEDMBB2pnH11HZ'
);

function msleep(n) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

function sleep(n) {
	msleep(n * 1000);
}

const client = new Discord.Client();

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

const updateChannel = (message, channel, departments = false) => {
	let baseType = 'Course Catalog';
	if (departments) {
		baseType = 'Course Subjects';
	}

	base(baseType)
		.select({
			view: 'Grid view'
		})
		.eachPage(
			function page(records, fetchNextPage) {
				const assignmentData = [];
				records.forEach(record => {
					assignmentData.push({
						name: record.get('Name'),
						channel: record.get('Discord Channel ID'),
						teachers: record.get('Teacher Discord User IDs'),
						students: record.get('Student Discord User IDs')
					});
				});
				fetchNextPage();

				assignmentData.map(a => {
					a.channel.split(', ').map(async i => {
						if (i == channel) {
							const channelSelect = await client.channels.fetch(i);

							let perms = [
								{
									id: config.manTeamRole,
									allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
								},
								{
									id: config.mutedRole,
									deny: ['SEND_MESSAGES', 'SPEAK', 'ADD_REACTIONS']
								},
								{
									id: config.botRole,
									allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
								},
								{
									id: config.everyoneRole,
									deny: ['VIEW_CHANNEL', 'SEND_MESSAGES']
								}
							];
							let combined = [];
							if (!departments) {
								combined = [...a.teachers, ...a.students].filter(e => {
									return e != null;
								});
							} else {
								combined = [...a.teachers].filter(e => {
									return e != null;
								});
							}

							await combined.map(async c => {
								await client.guilds.cache
									.get(config.guildID)
									.members.fetch(c)
									.then(async () => {
										perms.push({
											id: c,
											allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
										});
									})
									.catch(async () => {
										combined.splice(combined.indexOf(c), 1);
										await message.channel.send(
											'<@' + c + '> is NOT in the server.'
										);
									});
							});

							if (departments) {
								perms.push({
									id: config.orgRepRole,
									allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_MESSAGES']
								});
							}

							if (perms.length < 100) {
								await channelSelect
									.overwritePermissions(perms)
									.then(async () => {
										return message.channel.send(
											'Permissions updated for ' + channelSelect.toString()
										);
									})
									.catch(async error => {
										console.log(error);
										// Console.log(perms);
										if (
											channelSelect.permissionOverwrites.size != perms.length
										) {
											return message.channel.send(
												'Error updating permissions for ' +
                          channelSelect.toString() +
                          '\nChannel has ' +
                          channelSelect.permissionOverwrites.size +
                          ' perms overwrites, it should have ' +
                          perms.length
											);
										}
									});
							} else {
								const channelSelect = await client.channels.fetch(i);
								await channelSelect
									.overwritePermissions(perms.slice(0, 100))
									.then(async () => {
										await message.channel.send(
											'Base permissions updated for ' + channelSelect.toString()
										);
									})
									.catch(async error => {
										console.log(error);

										if (
											channelSelect.permissionOverwrites.size != perms.length
										) {
											await message.channel.send(
												'Error updating base permissions for ' +
                          channelSelect.toString()
											);
										}
									});

								message.channel.send(
									(await channelSelect.toString()) +
                    ' has over 100 permissions overwrites, using alternative method.'
								);
								perms = perms.slice(100);
								perms.map(async p => {
									await channelSelect
										.updateOverwrite(p.id, {
											VIEW_CHANNEL: true,
											SEND_MESSAGES: true
										})
										.then(async () => {
											/* Await message.channel.send(
                        "Gave permissions to `" +
                          p.id +
                          "` in " +
                          channelSelect.toString()
					  ) */
										})
										.catch(async () =>
											message.channel.send(
												'ERROR giving permissions to `' +
                          p.id +
                          '` in ' +
                          channelSelect.toString()
											)
										);
								});

								await message.channel.send(
									'Permissions updated for ' + channelSelect.toString()
								);
							}
						}
					});
				});
			},
			async function done(err) {
				if (err) {
					console.error(err);
				}
			}
		);
};

const updateUserIDsAndRoles = (type = 'Students', channel) => {
	// Can be type Students or Instructors
	let baseType = type;
	if (type == 'Instructors' || type == 'Students') {
		baseType = type;
	} else {
		return;
	}

	base(baseType)
		.select({
			view: 'Grid view'
		})
		.eachPage(
			function page(records, fetchNextPage) {
				records.forEach(async record => {
					// Assign role id's
					if (record.get('Discord User ID') == null) {
						client.users.cache.map(i => {
							if (
								i.username + '#' + i.discriminator ===
                record.get('Discord Username')
							) {
								base(baseType)
									.update([
										{
											id: record.id,
											fields: {
												'Discord User ID': i.id
											}
										}
									])
									.then(() =>
										channel.send(
											'Updated record for `' +
                        i.username +
                        '#' +
                        i.discriminator +
                        '`'
										)
									);
							}
						});
					}

					// Give people roles
					if (record.get('Discord User ID') != null) {
						const member = await client.guilds.cache
							.get(config.guildID)
							.members.fetch(record.get('Discord User ID'))
							.catch(error => {
								console.log('IGNORE');
								return channel.send(
									record.get('Name') +
                    ' (<@' +
                    record.get('Discord User ID') +
                    '>) is not in the discord server'
								);
							}); // These will be errors after this if the user is not in the server, just ignore them

						// assume its student role, otherwise change
						let role = client.guilds.cache
							.get(config.guildID)
							.roles.cache.get(config.enrolledRole);
						if (baseType == 'Instructors') {
							role = client.guilds.cache
								.get(config.guildID)
								.roles.cache.get(config.teachingTeamRole);
						}

						// Only for accepted students
						let cont = false;
						if (
							record.get('Verdict') == 'ACCEPTED' ||
              baseType == 'Instructors'
						) {
							cont = true;
						}

						if (!member.roles.cache.has(role.id) && cont) {
							await member.roles
								.add(role)
								.then(
									async () =>
										await channel.send(
											'Gave `' +
                        member.user.username +
                        '#' +
                        member.user.discriminator +
                        '` the ' +
                        role.name +
                        ' role.'
										)
								)
								.catch(async error => {
									await channel.send(
										'ERROR giving `' +
                      member.user.username +
                      '#' +
                      member.user.discriminator +
                      '` the ' +
                      role.name +
                      ' role.'
									);
								});
							sleep(3);
						}
					}
				});
				fetchNextPage();
			},
			function done(err) {
				if (err) {
					console.error(err);
					return channel.send(
						'<@581319977265790986> Error updating student user IDs.'
					);
				}

				return channel.send(baseType + ' user IDs have been updated.');
			}
		);
};

client.on('message', async message => {
	const contents = message.content.toLowerCase().split(' ');
	const cmd = contents[1];
	const args = contents.slice(2);
	if (
		contents[0] === config.prefix &&
    message.channel.id == config.botChannelID
	) {
		if (cmd === 'update') {
			if (args[1] == 'teachers') {
				return updateChannel(
					message,
					args[0].substring(2, args[0].length - 1),
					true
				);
			}

			if (args[0] != null) {
				return updateChannel(message, args[0].substring(2, args[0].length - 1));
			}

			return message.channel.send('Invalid channel.');
		}

		if (cmd === 'records') {
			await message.channel.send('Updating records and assigning roles.');
			await updateUserIDsAndRoles('Students', message.channel);
			return updateUserIDsAndRoles('Instructors', message.channel);
		}
	}
});

client.login(process.env.token);
