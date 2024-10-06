/**
 * @author  Muhammad Adriansyah - Zayden
 * @description Simple Code Chat AI With Whatsapp API Non Official
 * @version 1.1.0
 * @copyright 2024
 * @license MIT
 */

require("dotenv").config();
const {
  useMultiFileAuthState,
  default: makeWASocket,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  makeInMemoryStore,
  PHONENUMBER_MCC,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const NodeCache = require("node-cache");
const Groq = require("groq-sdk");
const Boom = require("@hapi/boom");

// Set Apikey Check Env
const groq = new Groq({
  apiKey: process.env.GROQ_APIKEY,
});

/**
 *  @type {import("pino").Logger}
 */
const logger = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ class: "zayden" });
logger.level = "fatal";

/**
 * @type {import("@whiskeysockets/baileys").MessageStore}
 */
const store = makeInMemoryStore({ logger });

/**
 * @type {import("@whiskeysockets/baileys").Baileys}
 */
async function Handler() {
  const { state, saveCreds } = await useMultiFileAuthState("session"); // load the credentials from the session folder
  const msgRetryCounterCache = new NodeCache(); // cache for message retries

  const sock = makeWASocket({
    version: [2, 3000, 1015901307], // version of WhatsApp Web to use
    logger, // optional logger
    printQRInTerminal: process.argv.includes("qr"), // print QR code in terminal
    auth: {
      creds: state.creds, // optional, pass in the credentials
      keys: makeCacheableSignalKeyStore(state.keys, logger), // optional, pass in the keys
    }, // optional, pass in the auth credentials
    browser: Browsers.windows("firefox"), // optional, pass in the browser
    markOnlineOnConnect: true, // mark the account as online after connecting
    generateHighQualityLinkPreview: true, // generate high quality link previews
    syncFullHistory: true, // sync full chat history
    retryRequestDelayMs: 10, // delay between requests
    msgRetryCounterCache, // cache for message retries
    transactionOpts: {
      maxCommitRetries: 10, // max retries to commit a transaction
      delayBetweenTriesMs: 10, // delay between retries
    }, // options for transactions
    defaultQueryTimeoutMs: undefined, // default timeout for queries
    maxMsgRetryCount: 15, // max retries for a message
    appStateMacVerification: {
      patch: true, // patch the app state for mac verification
      snapshot: true, // snapshot the app state for mac verification
    }, // options for mac verification
    getMessage: async (key) => {
      const jid = jidNormalizedUser(key.remoteJid);
      const msg = await store.loadMessage(jid, key.id);
      return msg?.message || list || "";
    }, // get a message from the store
  });

  store.bind(sock.ev); // bind the store to the client

  // Logic to used pairing code
  if (!process.argv.includes("qr") && !sock.authState.creds.registered) {
    let phoneNumber = process.argv[process.argv.indexOf("--number") + 1]; // get the number to pair with
    // if the number is not provided, exit
    if (!phoneNumber) {
      console.info(
        "Please provide a number to pair with\n\nExample: node handler.js --number 628xxxxxxx"
      );
      process.exit(1);
    }
    if (phoneNumber.startsWith("0")) phoneNumber = "62" + phoneNumber.slice(1); // convert 0 to 62
    phoneNumber = phoneNumber.replace(/[^0-9]/g, ""); // remove non-numeric characters
    if (!Object.keys(PHONENUMBER_MCC).some((v) => phoneNumber.startsWith(v))) {
      console.info("Invalid phone number");
      process.exit(1);
    }

    await sleep(5000); // wait for the socket to connect
    let code = await sock.requestPairingCode(phoneNumber); // request the pairing code
    console.info("Pairing code:", code.match(/.{1,4}/g).join("-")); // print the pairing code
  }

  // Logic Connect to WhatsApp
  sock.ev.on("connection.update", (update) => {
    const { lastDisconnect, connection } = update;

    if (connection) return console.info(`Connection Status: ${connection}`);

    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;

      switch (reason) {
        case DisconnectReason.badSession:
          console.info("Bad session");
          Handler();
          break;
        case DisconnectReason.connectionClosed:
          console.info("Connection closed");
          Handler();
          break;
        case DisconnectReason.connectionLost:
          console.info("Connection lost");
          Handler();
          break;
        case DisconnectReason.connectionReplaced:
          console.info("Connection replaced");
          Handler();
          break;
        case DisconnectReason.restartRequired:
          console.info("Restart required");
          Handler();
          break;
        case DisconnectReason.loggedOut:
          console.info("Logged out");
          if (fs.readdirSync("session")) {
            for (const file of fs.readdirSync("session")) {
              fs.unlinkSync(`session/${file}`);
            }
          }
          process.exit(1);
          break;
        case DisconnectReason.multideviceMismatch:
          return console.info("Multidevice mismatch");
          break;
        default:
          return console.info("Unknown reason");
      }
    }

    if (connection === "open") {
      console.info("Connection open");
    }
  });

  sock.ev.on("creds.update", saveCreds); // save the credentials when they are updated

  // Logic to send message
  sock.ev.on("messages.upsert", async (msg) => {
    if (msg.messages.length === 0) return;
    let messages = msg.messages[0]; // get the message
    let jid = messages.key.remoteJid; // get the jid

    let reply = (text) => sock.sendMessage(jid, { text }, { quoted: messages }); // reply to the message

    if (msg.messages[0].key.fromMe) return; // ignore messages from self

    // Logic to Chat AI
    if (msg.messages[0].message?.conversation) {
      // Check API Key
      if (process.env.GROQ_APIKEY === undefined) {
        new Error("Please provide GROQ_APIKEY in .env file");
        process.exit(1);
      }

      if (process.env.GROUP && jid.endsWith("@g.us")) return;

      let chatAI = await ChatAI(msg.messages[0].message.conversation); // Chat AI
      reply(chatAI);

      // Log Chat AI
      console.log("====================================");
      console.log("By : " + msg.messages[0].key.remoteJid);
      console.log("Message : " + msg.messages[0].message.conversation);
      console.log("Reply : " + chatAI);
      console.log("Date : " + new Date().toLocaleString());
      console.log("====================================\n\n");
    }
  });
}

// Run Handler
(function () {
  Handler();
})();

// Sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Get Date
function getDate() {
  const options = { timeZone: "Asia/Jakarta", hour12: false };
  const now = new Date().toLocaleString("en-US", options);
  const date = new Date(now);

  const month = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const monthName = month[date.getMonth()];
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayName = days[date.getDay()];

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  const timeString = `${hours}:${minutes}:${seconds}`;
  const dayString = `${dayName}`;

  return `${dayString} ${timeString} Bulan ${monthName}`;
}

// Chat AI
async function ChatAI(text) {
  const { version } = await JSON.parse(fs.readFileSync("package.json")); // Get Version

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `ZYD-AI adalah kecerdasan buatan generasi terbaru, dengan nama ZYD-AI Generasi ${version}, yang diciptakan oleh Muhammad Adriansyah, seorang arsitek berbakat. ZYD-AI dikenal karena kecerdasannya yang luar biasa serta kemampuannya membantu orang lain dengan baik dan tepat sasaran. Saya selalu siap untuk menjawab pertanyaan, memberikan bantuan, dan mendampingi kamu dalam berbagai hal.\n\nSaat ini, waktu menunjukkan ${getDate()}.\n\nJika kamu memiliki pertanyaan atau membutuhkan bantuan tentang apapun, jangan ragu untuk bertanya! Saya di sini untuk membantu.`,
      },
      {
        role: "user",
        content: text,
      },
    ],
    model: "gemma-7b-it",
    temperature: 1,
    max_tokens: 512,
    top_p: 1,
    stream: false,
    stop: null,
  });

  return chatCompletion.choices[0].message.content;
}

// Logic to Watch File Changes
// Jangan lupa untuk menghapus kode ini saat deploy ke production
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(`Update ${__filename}`);
  delete require.cache[file];
  require(file);
});
