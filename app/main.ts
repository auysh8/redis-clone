import * as net from "net";
import { parseRESP } from "./protocol/parser";
import { streamStore } from "./storage/streamStore";
import { listStore } from "./storage/listStore";
import { stringStore } from "./storage/kvStore";

//contains all the commands and thier callback functions
const commandMap: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  PING: (connection) => connection.write("+PONG\r\n"),

  ECHO: (connection, args) =>
    connection.write(`$${args[0].length}\r\n${args[0]}\r\n`),
};

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    const commandTokens = parseRESP(data); //convert the RESP command to something usefull
    const command: string = commandTokens.command; //extract the command from command tokens

    // run commands
    const runCommand = (
      command: string,
      commandMap: Record<
        string,
        (connection: net.Socket, args: string[]) => void
      >,
    ) => {
      const commandHandler = commandMap[command];

      if (commandHandler) {
        commandHandler(connection, commandTokens.args);
      } else {
        connection.write(`-ERR unknown command '${command}'\r\n`);
      }
    };

    runCommand(command, commandMap);
  });
});

server.listen(6379, "127.0.0.1");
