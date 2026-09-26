import * as net from "net";
import { encoder } from "../protocol/encoder";

const connectionCommands: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  PING: (connection) => {
    connection.write(`${encoder("PONG", "simpleStr")}`);
    return;
  },

  ECHO: (connection, args) => {
    connection.write(`${encoder(args[0], "bulkStr")}`);
    return;
  },
};

export { connectionCommands };
