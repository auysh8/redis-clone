import type { Buffer } from "buffer";
import * as net from "net";

const database = new Map<string, { value: string; expiresAt?: number }>();

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
        database.set(key, { value, expiresAt });
      } else {
        database.set(key, { value });
      }
      connection.write("+OK\r\n");
    } else if (command === "GET") {
      const data = database.get(message[4]);
      if (!data) {
        connection.write("$-1\r\n");
      } else if (data.expiresAt && data.expiresAt < Date.now()) {
        connection.write("$-1\r\n");
      } else {
        connection.write(`$${data.value?.length}\r\n${data.value}\r\n`);
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
