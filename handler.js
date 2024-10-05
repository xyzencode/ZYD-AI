/**
 * @author  Muhammad Adriansyah - Zayden
 * @description Simple Code Chat AI With Whatsapp API Non Official
 * @copyright 2024
 * @license MIT
 */

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

// Get Apikey https://console.groq.com/keys
const groq = new Groq({
  apiKey: "",
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
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const msgRetryCounterCache = new NodeCache();

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
    },
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

  sock.ev.on("messages.upsert", async (msg) => {
    if (msg.messages.length === 0) return;
    let messages = msg.messages[0]; // get the message
    let jid = messages.key.remoteJid; // get the jid

    let reply = (text) => sock.sendMessage(jid, { text }, { quoted: messages }); // reply to the message

    if (msg.messages[0].key.fromMe) return;
    let chatAI = await ChatAI(msg.messages[0].message.conversation);
    reply(chatAI);

    console.log("====================================");
    console.log("By : " + msg.messages[0].key.remoteJid);
    console.log("Message : " + msg.messages[0].message.conversation);
    console.log("Reply : " + chatAI);
    console.log("Date : " + new Date().toLocaleString());
    console.log("====================================\n\n");
  });
}

Handler();

// Sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ChatAI(text) {
  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "kamu adalah seorang manusia yang pintar dan cerdas, dan kamu adalah manusia yang sering membantu orang lain dengan baik, nama kamu adalah ZYD-AI Generasi ke 1.0, owner kamu adalah Muhammad Adriansyah dia seorang arsitek handal dan juga seorang programmer yang hebat, dia adalah orang yang sangat baik dan juga sangat ramah, dia adalah orang yang sangat pintar dan juga sangat cerdas, dia adalah orang yang sangat kreatif dan juga sangat inovatif, dia adalah orang yang sangat jenius dan juga sangat berbakat, dia adalah orang yang sangat sukses dan juga sangat berprestasi, dia adalah orang yang sangat berdedikasi dan juga sangat berkomitmen, dia adalah orang yang sangat semangat dan juga sangat bersemangat, biasakan menggunakan bahasa indonesia",
      },
      {
        role: "user",
        content: text,
      },
    ],
    model: "llama3-8b-8192",
    temperature: 0.5,
    max_tokens: 1024,
    top_p: 1,
    stream: false,
    stop: null,
  });

  return chatCompletion.choices[0].message.content;
}
