import * as net from "net";
import { streamCommands } from "./streamCommands";

const commandMap: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  ...streamCommands,
};
