const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const express = require("express");

// ===== KEEP ALIVE FOR RENDER =====
const app = express();
app.get("/", (req, res) => res.send("Bot is online"));
app.listen(process.env.PORT || 3000);

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;       // Render environment variable
const MONGO_URI = process.env.MONGO_URI;
const prefix = process.env.PREFIX || ",";
const embedColor = "#3498db";
const MY_GUILD_ID = "1426789471776542803"; // your server ID

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ===== DATABASE =====
const userSchema = new mongoose.Schema({
  userId: String,
  points: { type: Number, default: 0 },
  chatMessages: { type: Number, default: 0 },
  vcTime: { type: Number, default: 0 },
  vcTier: { type: String, default: "Tier 0" },
  achievements: { type: Array, default: [] },
  vip: { type: Boolean, default: false },
  lastDaily: { type: Number, default: 0 },
  lastMonthly: { type: Number, default: 0 },
  _vcJoin: { type: Number, default: null }
});
const User = mongoose.model("User", userSchema);

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch(console.error);

// ===== AUTOMATIC CHAT TRACKING =====
const chatCooldown = new Set();
client.on("messageCreate", async (message) => {
  if (!message.guild || message.guild.id !== MY_GUILD_ID || message.author.bot) return;

  // Auto chat messages + points
  if (!chatCooldown.has(message.author.id)) {
    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = await User.create({ userId: message.author.id });
    user.chatMessages += 1;
    user.points += 1;
    await user.save();
    chatCooldown.add(message.author.id);
    setTimeout(() => chatCooldown.delete(message.author.id), 5000); // 5s cooldown
  }

  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // ===== MODERATION =====
  if (command === "ban") {
    if (!message.member.permissions.has("BanMembers")) return;
    const member = message.mentions.members.first();
    const reason = args.join(" ") || "No reason provided";
    if (!member) return message.reply("Mention a user to ban.");
    await member.ban({ reason }).catch(console.error);
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`**${member.user.tag}** was banned for ${reason}.`)
    ]});
  }

  if (command === "kick") {
    if (!message.member.permissions.has("KickMembers")) return;
    const member = message.mentions.members.first();
    const reason = args.join(" ") || "No reason provided";
    if (!member) return message.reply("Mention a user to kick.");
    await member.kick(reason).catch(console.error);
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`**${member.user.tag}** was kicked for ${reason}.`)
    ]});
  }

  if (command === "mute") {
    if (!message.member.permissions.has("MuteMembers")) return;
    const member = message.mentions.members.first();
    const time = args[1] || "10m";
    if (!member) return message.reply("Mention a user to mute.");
    await member.timeout(ms(time)).catch(console.error);
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`**${member.user.tag}** was muted for ${time}.`)
    ]});
  }

  // ===== POINTS & CASINO =====
  if (command === "points") {
    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = await User.create({ userId: message.author.id });
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`**${message.author.tag}** has ${user.points} points.`)
    ]});
  }

  if (command === "daily") {
    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = await User.create({ userId: message.author.id });
    const now = Date.now();
    if (user.lastDaily && now - user.lastDaily < 24*60*60*1000) return message.reply("You already claimed daily.");
    user.points += 100;
    user.lastDaily = now;
    await user.save();
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`**${message.author.tag}** claimed 100 points!`)
    ]});
  }

  if (command === "monthly") {
    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = await User.create({ userId: message.author.id });
    const now = Date.now();
    if (user.lastMonthly && now - user.lastMonthly < 30*24*60*60*1000) return message.reply("You already claimed monthly.");
    user.points += 3000;
    user.lastMonthly = now;
    await user.save();
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`**${message.author.tag}** claimed 3000 monthly points!`)
    ]});
  }

  // ===== USER INFO =====
  if (command === "user") {
    let member = message.mentions.members.first() || message.member;
    let user = await User.findOne({ userId: member.id });
    if (!user) user = await User.create({ userId: member.id });
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`**${member.user.tag}**\nPoints: ${user.points}\nChat messages: ${user.chatMessages}\nVC time: ${user.vcTime}m\nVC Tier: ${user.vcTier}`)
    ]});
  }

  // ===== SERVER INFO =====
  if (command === "server") {
    const g = message.guild;
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`Server Name: ${g.name}\nServer ID: ${g.id}\nOwner: ${g.ownerId}\nMembers: ${g.memberCount}\nBoosts: ${g.premiumSubscriptionCount}\nCreated: ${g.createdAt}\nRoles: ${g.roles.cache.size}`)
    ]});
  }

  // ===== BANNER =====
  if (command === "banner") {
    let member = message.mentions.members.first() || message.member;
    const bannerURL = member.user.bannerURL({ size: 1024 });
    if (!bannerURL) return message.channel.send(`**${member.user.tag}** does not have a banner.`);
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`Banner for ${member.user.tag}`)
      .setImage(bannerURL)
    ]});
  }

  // ===== CASINO =====
  if (command === "gamble" || command === "casino") {
    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = await User.create({ userId: message.author.id });
    let bet = parseInt(args[0]);
    if (!bet || bet <= 0) return message.reply("Enter a valid bet.");
    if (bet > user.points) return message.reply("You don't have enough points.");
    const win = Math.random() < 0.5;
    if (win) {
      user.points += bet;
      await user.save();
      message.channel.send({ embeds: [new EmbedBuilder()
        .setColor(embedColor)
        .setDescription(`🎉 You won **${bet}** points! Total: **${user.points}**`)
      ]});
    } else {
      user.points -= bet;
      await user.save();
      message.channel.send({ embeds: [new EmbedBuilder()
        .setColor(embedColor)
        .setDescription(`💀 You lost **${bet}** points! Total: **${user.points}**`)
      ]});
    }
  }

  // ===== LEADERBOARD =====
  if (command === "lb" || command === "leaderboard") {
    const type = args[0] || "chat"; // chat or vc
    let top;
    if (type === "chat") top = await User.find({}).sort({ chatMessages: -1 }).limit(10);
    else if (type === "vc") top = await User.find({}).sort({ vcTime: -1 }).limit(10);
    else return message.reply("Use ,lb chat or ,lb vc");

    let desc = "";
    top.forEach((u, i) => {
      let medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`;
      const val = type === "chat" ? u.chatMessages : u.vcTime;
      desc += `${medal} — <@${u.userId}> • ${val}\n`;
    });

    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`Top 10 ${type === "chat" ? "Chat Messages" : "VC Time"}`)
      .setDescription(desc)
    ]});
  }

});

// ===== VOICE TRACKING =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (!newState.guild || newState.guild.id !== MY_GUILD_ID || newState.member.user.bot) return;
  let user = await User.findOne({ userId: newState.member.id });
  if (!user) user = await User.create({ userId: newState.member.id });

  if (!oldState.channelId && newState.channelId) {
    user._vcJoin = Date.now();
    await user.save();
  }

  if (oldState.channelId && !newState.channelId && user._vcJoin) {
    const minutes = Math.floor((Date.now() - user._vcJoin)/60000);
    user.vcTime += minutes;
    delete user._vcJoin;

    // Update VC Tier
    if (user.vcTime >= 360) user.vcTier = "Tier 3";
    else if (user.vcTime >= 180) user.vcTier = "Tier 2";
    else if (user.vcTime >= 60) user.vcTier = "Tier 1";
    await user.save();
  }
});

// ===== READY =====
client.on("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Automatically leave other servers
  client.guilds.cache.forEach(guild => {
    if (guild.id !== MY_GUILD_ID) {
      console.log(`Leaving unauthorized server: ${guild.name} (${guild.id})`);
      guild.leave().catch(console.error);
    }
  });
});

client.login(TOKEN);
