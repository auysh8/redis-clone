import * as net from "net";
import { streamCommands } from "./streamCommands";
import { listCommands } from "./listCommands";
import { kvCommands } from "./kvCommands";
import { connectionCommands } from "./connectionCommands";

const commandMap: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  ...streamCommands,
  ...listCommands,
  ...kvCommands,
  ...connectionCommands,
};

export { commandMap };
