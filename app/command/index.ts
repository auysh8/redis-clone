import * as net from "net";
import { streamCommands } from "./streamCommands";
import { listCommands } from "./listCommands";

const commandMap: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  ...streamCommands,
  ...listCommands,
};
