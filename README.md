# Example Whatsapp API multi device(new) and mqtt

This repository is example from whatsapp-api from [adiwajshing/Baileys](https://github.com/adiwajshing/Baileys/tree/master)
This example get chat from whatsapp and publish to mqtt and then you can publish message to spesific number whatsapp from mqtt (eg. send message whatsapp from arduino/ESP/PLC,SCADA)

## Requirement
Nodejs v16 

## Installation
For windows, install git first [git for windows](https://gitforwindows.org/)
For Linux, git already installed

Install global typescript first
```bash
npm install -g typescript
```

Install dependency first
```bash
npm install
```

Build app
```bash
npm run build
```

Run app
```bash
npm start
```

## Usage
Qrcode will display in terminal after "npm start", in your whatsapp app on android/ios will set to sender.

## Send to number whatsapp to and the publish to mqtt 
Send message to your number whatsapp (whatsapp as sender and scan qrcode from terminal), topic will publish to broker ismaillowkey.my.id with topic **wa/receive**

## Send message from mqtt to spesific number whatsapp
Connet to broker ismaillowkey.my.id and publish with topic **wa/send** and with body (number must with country code like 62 or indonesia)
```
{
 "number" : "62xxxx",
 "message" :  "your message"
}
```

## With pm2
[BUG] automatic restart app every 1 hour
```
pm2 start npm --name "whatsappmd-mqtt" -- start --cron-restart="0 * * * *"
```
