import type { Buffer } from "buffer";
import * as net from "net";

const stringStore = new Map<string, { value: string; expiresAt?: number }>();
const listStore = new Map<string, string[]>();

const parseRESP = (data: Buffer) => {
  const dataArr = data.toString().split("\r\n");
  const tokens = [];
  for (let i = 2; i < dataArr.length; i += 2) {
    tokens.push(dataArr[i]);
  }
  const commandTokens = {
    command: tokens[0].toUpperCase(),
    args: tokens.slice(1),
  };
  return commandTokens;
};

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    const commandTokens = parseRESP(data);      //convert the RESP command to something usefull
    console.log(commandTokens);
    const command = commandTokens.command;      //extract the command from command tokens
    
    if (command === "PING") {
      connection.write("+PONG\r\n");
    } else if (command === "ECHO") {
      connection.write(`$${commandTokens.args[0].length}\r\n${commandTokens.args[0]}\r\n`);
    } else if (command === "SET") {
      const subCommand = commandTokens.args[2]?.toUpperCase() || null;
      const key = commandTokens.args[0];
      const value = commandTokens.args[1];
      if (subCommand === "PX") {
        const expiresAt = Date.now() + Number(commandTokens.args[3]);
        stringStore.set(key, { value, expiresAt });
      } else {
        stringStore.set(key, { value });
      }
      connection.write("+OK\r\n");
    } else if (command === "GET") {
      const data = stringStore.get(commandTokens.args[0]);
      if (!data) {
        connection.write("$-1\r\n");
      } else if (data.expiresAt && data.expiresAt < Date.now()) {
        connection.write("$-1\r\n");
      } else {
        connection.write(`$${data.value?.length}\r\n${data.value}\r\n`);
      }
    } else if (command === "RPUSH") {
      const key = commandTokens.args[0];
      const value: string[] = [];
      for (let i = 1; i < commandTokens.args.length; i++) {
        value.push(commandTokens.args[i]);
      }
      if (listStore.has(key)) {
        listStore.get(key)?.push(...value);
      } else {
        listStore.set(key, value);
      }
      const lenOfList = listStore.get(key)?.length || 0;
      connection.write(`:${lenOfList}\r\n`);
    } else if (command === "LRANGE") {
      const key = commandTokens.args[0];
      let returnValue = "";
      let countItems = 0;
      if (listStore.has(key)) {
        const list = listStore.get(key) || [];
        let startRange = 0;
        let endRange = 0;
        const listLen = list.length;
        if (Number(commandTokens.args[1]) < 0) {
          startRange = listLen + Number(commandTokens.args[1]);
          if (startRange < 0) {
            startRange = 0;
          }
        } else {
          startRange = Number(commandTokens.args[1]);
        }
        if (Number(commandTokens.args[2]) < 0) {
          endRange = listLen + Number(commandTokens.args[2]);
        } else {
          endRange = Math.min(Number(commandTokens.args[2]), listLen - 1);
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
