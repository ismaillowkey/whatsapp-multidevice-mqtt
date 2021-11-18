import { readFileSync, writeFileSync } from "fs"
import P from "pino"
import { Boom } from "@hapi/boom"
import makeWASocket, { WASocket, AuthenticationState, DisconnectReason, AnyMessageContent, BufferJSON, initInMemoryKeyStore, delay } from '@adiwajshing/baileys-md'
const mqtt = require('mqtt')

const BROKER = 'ismaillowkey.my.id'
const TOPICRECEIVE = 'ismaillowkey/receivechat'
const TOPICSENDFROMMQTT = 'ismaillowkey/sendchat'
var mqttClient  = mqtt.connect('mqtt://' + BROKER, { clientId:"mqttjs01_" + Math.floor(Math.random() * 10000) })

mqttClient.on('connect', function () {
    console.log("connected to mqtt")
    mqttClient.subscribe(TOPICSENDFROMMQTT)
})

mqttClient.on('message', async function (topic, message) {
    // message is Buffer
    if (topic.toLowerCase() === TOPICSENDFROMMQTT){
        try {
            let messageParse = JSON.parse(message)
            let number = messageParse.number + "@s.whatsapp.net"
            let messageBody = messageParse.message

            console.log("new message from : " + messageParse.number)
            console.log(messageBody)

            const sendMsg = await sock.sendMessage(number,  { text: messageBody })
        }
        catch (err){
            console.log(err)
        }
    }
})

let sock: WASocket
(async() => {
    // load authentication state from a file
    const loadState = () => {
        let state: AuthenticationState | undefined = undefined
        try {
            const value = JSON.parse(
                readFileSync('./auth_info_multi.json', { encoding: 'utf-8' }),
                BufferJSON.reviver
            )
            state = {
                creds: value.creds,
                // stores pre-keys, session & other keys in a JSON object
                // we deserialize it here
                keys: initInMemoryKeyStore(value.keys)
            }
        } catch{  }
        return state
    }
    // save the authentication state to a file
    const saveState = (state?: any) => {
        //console.log('saving pre-keys')
        state = state || sock?.authState
        writeFileSync(
            './auth_info_multi.json',
            // BufferJSON replacer utility saves buffers nicely
            JSON.stringify(state, BufferJSON.replacer, 2)
        )
    }
    // start a connection
    const startSock = () => {
        const sock = makeWASocket({
            logger: P({ level: 'debug' }),
            auth: loadState(),
            printQRInTerminal: true
        })

        sock.ev.on('messages.upsert', async m => {
            const msg = m.messages[0]
            if (msg.message.conversation !== ''){
                console.log("----------------------------------")
                let numberString = msg.key.remoteJid.split("@")[0]
                console.log("pesan baru dari : " + numberString)
                console.log(msg.message.conversation)
                let dateObject = new Date(Number(msg.messageTimestamp) * 1000).toLocaleString()
                console.log("jam : " + dateObject)

                // sendt to mqtt
                let payload = {
                    number : numberString,
                    message : msg.message.conversation,
                    datetime : dateObject
                }
                mqttClient.publish(TOPICRECEIVE, JSON.stringify(payload))

                console.log("----------------------------------")
                let dateTime = new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"})

                if(!msg.key.fromMe && m.type === 'notify') {
                    //console.log('replying to', m.messages[0].key.remoteJid)
                    await sock!.sendReadReceipt(msg.key.remoteJid, msg.key.participant, [msg.key.id])
                    const messageSend = "[BOT] Ok, pesan sudah dibaca jam " + dateTime.toString() + " UTC+7"  + "\n" +
                                "dengan broker : " + BROKER.toString() + "\n" +
                                "dan topic : " + TOPICRECEIVE
                    await sendMessageWTyping({ text: messageSend }, msg.key.remoteJid)
                }
            }
        })

        function convertTZ(date, tzString) {
           return new Date((typeof date === "string" ? new Date(date) : date).toLocaleString("en-US", {timeZone: tzString}));
        }

        // sock.ev.on('messages.upsert', ({ messages }) => {
        //     console.log('got messages', messages)
        // })

        //sock.ev.on('messages.update', m => console.log(m))
        //sock.ev.on('presence.update', m => console.log(m))
        //sock.ev.on('chats.update', m => console.log(m))
        //sock.ev.on('contacts.update', m => console.log(m))
        return sock
    }

    const sendMessageWTyping = async(msg: AnyMessageContent, jid: string) => {

        await sock.presenceSubscribe(jid)
        await delay(500)

        await sock.sendPresenceUpdate('composing', jid)
        await delay(2000)

        await sock.sendPresenceUpdate('paused', jid)

        await sock.sendMessage(jid, msg)
    }

    sock = startSock()
    sock.ev.on('connection.update', (update) => {
                console.log("connection.update")
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            // reconnect if not logged out
            if((lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
                sock = startSock()
            } else {
                console.log('connection closed')
            }
        }

        //console.log('connection update', update.qr)
        if (update.qr !== undefined)
        {
            //qrcode.generate(update.qr, {small: true})
        }

    })
    // listen for when the auth state is updated
    // it is imperative you save this data, it affects the signing keys you need to have conversations
    sock.ev.on('auth-state.update', () => saveState())
})()
