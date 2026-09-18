import * as net from "net";
import { listStore } from "./listStore";
import { streamStore } from "./streamStore";

const stringStore = new Map<string, { value: string; expiresAt?: number }>();

const commandMap: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  SET: (connection, args) => {
    const subCommand = args[2]?.toUpperCase() || null;
    const key = args[0];
    const value = args[1];
    if (subCommand === "PX") {
      const expiresAt = Date.now() + Number(args[3]);
      stringStore.set(key, { value, expiresAt });
    } else {
      stringStore.set(key, { value });
    }
    connection.write("+OK\r\n");
  },

  GET: (connection, args) => {
    const data = stringStore.get(args[0]);
    if (!data) {
      connection.write("$-1\r\n");
    } else if (data.expiresAt && data.expiresAt < Date.now()) {
      connection.write("$-1\r\n");
      listStore.delete(args[0]);
    } else {
      connection.write(`$${data.value?.length}\r\n${data.value}\r\n`);
    }
  },

  TYPE: (connection, args) => {
    const key = args[0];
    if (stringStore.has(key)) {
      connection.write("+string\r\n");
    } else if (streamStore.has(key)) {
      connection.write("+stream\r\n");
    } else {
      connection.write("+none\r\n");
    }
  },
};

export { stringStore, commandMap };
