import * as net from "net";
import { parseRESP } from "./protocol/parser";
import { commandMap } from "./command";


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
