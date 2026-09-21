import * as net from "net";
import { encoder } from "../protocol/encoder";

const connectionCommands: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  PING: (connection) => connection.write(`${encoder("PONG" , "simpleStr")}`),

  ECHO: (connection, args) =>
    connection.write(`${encoder(args[0] , "bulkStr")}`)
    // connection.write(`$${args[0].length}\r\n${args[0]}\r\n`),
};

export { connectionCommands };
