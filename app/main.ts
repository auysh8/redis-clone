import type { Buffer } from "buffer";
import * as net from "net";

const stringStore = new Map<string, { value: string; expiresAt?: number }>();
const listStore = new Map<string, string[]>();

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    const message = data.toString().split("\r\n");
    console.log(message);
    const command = message[2]?.toUpperCase();
    if (command === "PING") {
      connection.write("+PONG\r\n");
    } else if (command === "ECHO") {
      connection.write(`$${message[4].length}\r\n${message[4]}\r\n`);
    } else if (command === "SET") {
      const subCommand = message[8]?.toUpperCase() || null;
      const key = message[4];
      const value = message[6];
      if (subCommand === "PX") {
        const expiresAt = Date.now() + Number(message[10]);
        stringStore.set(key, { value, expiresAt });
      } else {
        stringStore.set(key, { value });
      }
      connection.write("+OK\r\n");
    } else if (command === "GET") {
      const data = stringStore.get(message[4]);
      if (!data) {
        connection.write("$-1\r\n");
      } else if (data.expiresAt && data.expiresAt < Date.now()) {
        connection.write("$-1\r\n");
      } else {
        connection.write(`$${data.value?.length}\r\n${data.value}\r\n`);
      }
    } else if (command === "RPUSH") {
      const key = message[4];
      const value: string[] = [];
      for (let i = 6; i < message.length - 1; i = i + 2) {
        value.push(message[i]);
      }
      if (listStore.has(key)) {
        listStore.get(key)?.push(...value);
      } else {
        listStore.set(key, value);
      }
      const lenOfList = listStore.get(key)?.length || 0;
      connection.write(`:${lenOfList}\r\n`);
    } else if (command === "LRANGE") {
      const key = message[4];
      let returnValue = "";
      let countItems = 0;
      if (listStore.has(key)) {
        const list = listStore.get(key) || [];
        let startRange = 0;
        let endRange = 0;
        const listLen = list.length;
        if (Number(message[6]) < 0) {
          startRange = listLen + Number(message[6]);
          if(startRange < 0){
            startRange = 0
          }
        } else {
          startRange = Number(message[6]);
        }
        if (Number(message[8]) < 0) {
          endRange = listLen + Number(message[8]);
        } else {
          endRange = Math.min(Number(message[8]), listLen - 1);
        }
        console.log(endRange, "end");
        for (let i = startRange; i <= endRange; i++) {
          returnValue += "$" + list[i].length + "\r\n" + list[i] + "\r\n";
          countItems++;
        }
      }
      console.log(`*${countItems + "\r\n" + returnValue}`);
      connection.write(`*${countItems}\r\n${returnValue}`);
    }
  });
});

server.listen(6379, "127.0.0.1");
