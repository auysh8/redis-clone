import * as net from "net";
import { kvStore } from "../storage/kvStore";
import { streamStore } from "../storage/streamStore";
import { listStore } from "../storage/listStore";
import { encoder } from "../protocol/encoder";

const kvCommands: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  SET: (connection, args) => {
    const subCommand = args[2]?.toUpperCase() || null;
    const key = args[0];
    const value = args[1];
    if (subCommand === "PX") {
      const expiresAt = Date.now() + Number(args[3]);
      kvStore.set(key, { value, expiresAt });
    } else {
      kvStore.set(key, { value });
    }
    connection.write(`${encoder("OK", "simpleStr")}`);
    return;
  },

  GET: (connection, args) => {
    const data = kvStore.get(args[0]);
    if (!data) {
      connection.write("$-1\r\n");
      return;
    } else if (data.expiresAt && data.expiresAt < Date.now()) {
      connection.write(`${encoder("", "null")}`);
      listStore.delete(args[0]);
      return;
    } else {
      connection.write(`${encoder(data.value, "bulkStr")}`);
      return;
    }
  },

  TYPE: (connection, args) => {
    const key = args[0];
    if (kvStore.has(key)) {
      connection.write(`${encoder("string", "simpleStr")}`);
      return;
    } else if (streamStore.has(key)) {
      connection.write(`${encoder("stream", "simpleStr")}`);
      return;
    } else {
      connection.write(`${encoder("none", "simpleStr")}`);
      return;
    }
  },
};

export { kvCommands };
