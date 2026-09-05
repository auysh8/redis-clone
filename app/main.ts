import type { Buffer } from "buffer";
import * as net from "net";

const database = new Map<string, string>();

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
      database.set(message[4], message[6]);
      connection.write("+OK\r\n");
    } else if (command === "GET") {
      const value = database.get(message[4]);
      if (value == undefined) {
        connection.write("$-1\r\n");
      } else {
        connection.write(`$${value?.length}\r\n${value}\r\n`);
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
