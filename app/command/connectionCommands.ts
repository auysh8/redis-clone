import * as net from "net";

const connectionCommands: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  PING: (connection) => connection.write("+PONG\r\n"),

  ECHO: (connection, args) =>
    connection.write(`$${args[0].length}\r\n${args[0]}\r\n`),
};

export { connectionCommands };
