// Create by Ismail Lowkey
import { Boom } from "@hapi/boom";
import makeWASocket, {
  AnyMessageContent,
  delay,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  MessageRetryMap,
  useMultiFileAuthState,
} from "@adiwajshing/baileys";
import MAIN_LOGGER from "./logger";
const logger = MAIN_LOGGER.child({});
logger.level = "error";
const fs = require("fs");
// require json-2-csv module
const converter = require("json-2-csv");

const useStore = !process.argv.includes("--no-store");
const doReplies = !process.argv.includes("--no-reply");

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterMap: MessageRetryMap = {};

// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = useStore ? makeInMemoryStore({ logger }) : undefined;
store?.readFromFile("./baileys_store_multi.json");
// save every 10s
setInterval(() => {
  store?.writeToFile("./baileys_store_multi.json");
}, 10_000);

// mqtt
const mqtt = require("mqtt");
const BROKER = "ismaillowkey.my.id";
const TOPICRECEIVE = "wa/receive";
const TOPICSENDFROMMQTT = "wa/send";
var mqttClient = mqtt.connect("mqtt://" + BROKER, {
  clientId: "mqttjs01_" + Math.floor(Math.random() * 10000),
});

let sock;
// start a connection
const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  // fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    msgRetryCounterMap,
    // implement to handle retries
    getMessage: async (key) => {
      return {
        conversation: "hello",
      };
    },
  });

  store?.bind(sock.ev);

  const sendMessageWTyping = async (msg: AnyMessageContent, jid: string) => {
    await sock.presenceSubscribe(jid);
    await delay(500);

    await sock.sendPresenceUpdate("composing", jid);
    await delay(2000);

    await sock.sendPresenceUpdate("paused", jid);

    await sock.sendMessage(jid, msg);
  };

  sock.ev.on("call", (item) => console.log("recv call event", item));
  sock.ev.on("chats.set", (item) =>
    console.log(`recv ${item.chats.length} chats (is latest: ${item.isLatest})`)
  );
  sock.ev.on("messages.set", (item) =>
    console.log(
      `recv ${item.messages.length} messages (is latest: ${item.isLatest})`
    )
  );
  sock.ev.on("contacts.set", (item) =>
    console.log(`recv ${item.contacts.length} contacts`)
  );

  sock.ev.on("messages.upsert", async (m) => {
    console.log(JSON.stringify(m, undefined, 2));

    const msg = m.messages[0];
    if (msg.message.conversation !== "") {
      console.log("----------------------------------");
      let numberString = msg.key.remoteJid.split("@")[0];
      console.log("pesan baru dari : " + numberString);
      console.log(msg.message.conversation);
      let dateObject = new Date(
        Number(msg.messageTimestamp) * 1000
      ).toLocaleString();
      console.log("jam : " + dateObject);

      // sendt to mqtt
      let payload = {
        number: numberString,
        message: msg.message.conversation,
        datetime: dateObject,
      };
      mqttClient.publish(TOPICRECEIVE, JSON.stringify(payload));

      console.log("----------------------------------");
      let dateTime = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Jakarta",
      });

      if (!msg.key.fromMe && m.type === "notify") {
        //console.log('replying to', m.messages[0].key.remoteJid)
        await sock!.sendReadReceipt(msg.key.remoteJid, msg.key.participant, [
          msg.key.id,
        ]);
        const messageSend =
          "[BOT] Ok, pesan sudah dibaca jam " +
          dateTime.toString() +
          " UTC+7" +
          "\n" +
          "dengan broker : " +
          BROKER.toString() +
          "\n" +
          "dan topic : " +
          TOPICRECEIVE;
        await sendMessageWTyping({ text: messageSend }, msg.key.remoteJid);

        // save to csv
        fs.access("wa2mqtt.csv", function (error) {
            if (error) {
              // create file with header if file not exist
              converter.json2csv(payload, (err, csv) => {
                  if (!err) 
                  fs.writeFileSync("wa2mqtt.csv", csv + "\n", "utf-8"); //create a new file
                }, { prependHeader: true }
              );
            } else {
              // append file without header if file exist
              converter.json2csv(payload, (err, csv) => {
                if (!err) 
                fs.writeFileSync("wa2mqtt.csv", csv + "\n", { flag: "a+" }); //append file
              }, { prependHeader: false }
            );
            }
        });
    }
    }
    // if(!msg.key.fromMe && m.type === 'notify' && doReplies) {
    // 	console.log('replying to', m.messages[0].key.remoteJid)
    // 	await sock!.sendReadReceipt(msg.key.remoteJid, msg.key.participant, [msg.key.id])
    // 	await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid)
    // }
  });

  sock.ev.on("messages.update", (m) => console.log(m));
  sock.ev.on("message-receipt.update", (m) => console.log(m));
  sock.ev.on("presence.update", (m) => console.log(m));
  sock.ev.on("chats.update", (m) => console.log(m));
  sock.ev.on("chats.delete", (m) => console.log(m));
  sock.ev.on("contacts.upsert", (m) => console.log(m));

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      // reconnect if not logged out
      if (
        (lastDisconnect.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut
      ) {
        startSock();
      } else {
        console.log("Connection closed. You are logged out.");
      }
    }

    console.log("connection update", update);
  });
  // listen for when the auth credentials is updated
  sock.ev.on("creds.update", saveCreds);

  return sock;
};

startSock();

mqttClient.on("connect", function () {
  console.log("connected to mqtt");
  mqttClient.subscribe(TOPICSENDFROMMQTT);
});

// if receive message from mqtt
mqttClient.on("message", async function (topic, message) {
  // message is Buffer
  if (topic.toLowerCase() === TOPICSENDFROMMQTT) {
    try {
      let messageParse = JSON.parse(message);
      let number = messageParse.number + "@s.whatsapp.net";
      let messageBody = messageParse.message;

      console.log("new message from : " + messageParse.number);
      console.log(messageBody);

      const sendMsg = await sock.sendMessage(number, { text: messageBody });

      // save to csv
      fs.access("mqtt2wa.csv", function (error) {
        if (error) {
          // create file with header if file not exist
          converter.json2csv(messageParse, (err, csv) => {
              if (!err) 
              fs.writeFileSync("mqtt2wa.csv", csv + "\n", "utf-8"); //create a new file
            }, { prependHeader: true }
          );
        } else {
          // append file without header if file exist
          converter.json2csv(messageParse, (err, csv) => {
            if (!err) 
            fs.writeFileSync("mqtt2wa.csv", csv + "\n", { flag: "a+" }); //append file
          }, { prependHeader: false }
        );
        }
    });
    } catch (err) {
      console.log(err);
    }
  }
});
