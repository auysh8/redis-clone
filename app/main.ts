import type { Buffer } from "buffer";
import { connect } from "http2";
import * as net from "net";

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    const message = data.toString().split("\r\n");
    console.log(message);
    if (message.includes("PING")) {
      connection.write("+PONG\r\n");
    } else if (data.includes("ECHO")) {
      connection.write(`$${message[4].length}\r\n${message[4]}\r\n`);
    }
  });
});

server.listen(6379, "127.0.0.1");
