import * as net from "net";
import { listStore } from "../storage/listStore";

const waitingStore = new Map<string, net.Socket[]>();

const listCommands: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  RPUSH: (connection, args) => {
    const key = args[0];
    const value = [];
    for (let i = 1; i < args.length; i++) {
      value.push(args[i]);
    }

    if (listStore.has(key)) {
      listStore.get(key)?.push(...value);
    } else {
      listStore.set(key, value);
    }
    const lenOfList = listStore.get(key)?.length || 0;
    if (waitingStore.has(key)) {
      const waiter = waitingStore.get(key)?.shift();
      const popedElement = listStore.get(key)?.shift();
      waiter?.write(
        `*2\r\n$${key.length}\r\n${key}\r\n$${popedElement?.length}\r\n${popedElement}\r\n`,
      );
    }
    connection.write(`:${lenOfList}\r\n`);
  },

  LPUSH: (connection, args) => {
    const key = args[0];
    const value = [];
    for (let i = 1; i < args.length; i++) {
      value.unshift(args[i]);
    }

    if (listStore.has(key)) {
      listStore.get(key)?.unshift(...value);
    } else {
      listStore.set(key, value);
    }
    const lenOfList = listStore.get(key)?.length;
    if (waitingStore.has(key)) {
      const waiter = waitingStore.get(key)?.shift();
      const popedElement = listStore.get(key)?.shift();
      waiter?.write(
        `*2\r\n$${key.length}\r\n${key}\r\n$${popedElement?.length}\r\n${popedElement}\r\n`,
      );
    }
    connection.write(`:${lenOfList}\r\n`);
  },

  LRANGE: (connection, args) => {
    {
      const key = args[0];
      let returnValue = "";
      let countItems = 0;
      if (listStore.has(key)) {
        const list = listStore.get(key) || [];
        let startTime = 0;
        let endTime = 0;
        const listLen = list.length;
        if (Number(args[1]) < 0) {
          startTime = listLen + Number(args[1]);
          if (startTime < 0) {
            startTime = 0;
          }
        } else {
          startTime = Number(args[1]);
        }
        if (Number(args[2]) < 0) {
          endTime = listLen + Number(args[2]);
        } else {
          endTime = Math.min(Number(args[2]), listLen - 1);
        }
        for (let i = startTime; i <= endTime; i++) {
          returnValue += "$" + list[i].length + "\r\n" + list[i] + "\r\n";
          countItems++;
        }
      }
      connection.write(`*${countItems}\r\n${returnValue}`);
    }
  },

  LLEN: (connection, args) => {
    const key = args[0];
    if (listStore.has(key)) {
      connection.write(`:${listStore.get(key)?.length}\r\n`);
    } else {
      connection.write(`:0\r\n`);
    }
  },

  LPOP: (connection, args) => {
    const key = args[0];
    let itemsToPop = Number(args[1]) || 1;
    let elementPoped = [];
    if (listStore.has(key)) {
      let itemLen = listStore.get(key)?.length || 0;
      if (itemLen == 0) {
        connection.write("$-1\r\n");
        return null;
      }
      itemsToPop > itemLen ? (itemsToPop = itemLen) : null;
      for (let i = 0; i < itemsToPop; i++) {
        elementPoped.push(listStore.get(key)?.shift());
      }
    } else {
      connection.write("$-1\r\n");
      return null;
    }

    let respArr = "";
    for (let i = 0; i < elementPoped.length; i++) {
      respArr += `$${elementPoped[i]?.length}\r\n${elementPoped[i]}\r\n`;
    }

    if (args[1] == undefined) {
      connection.write(`$${elementPoped[0]?.length}\r\n${elementPoped[0]}\r\n`);
    } else {
      connection.write(`*${elementPoped.length}\r\n${respArr}`);
    }
  },

  BLPOP: (connection, args) => {
    const key = args[0];
    const time = Number(args[1]);
    if (listStore.has(key)) {
      const popedElement = listStore.get(key)?.shift();
      connection.write(
        `*2\r\n$${key.length}\r\n${key}\r\n$${popedElement?.length}\r\n${popedElement}\r\n`,
      );
      return null;
    }
    if (waitingStore.has(key)) {
      waitingStore.get(key)?.push(connection);
    } else {
      waitingStore.set(key, [connection]);
    }
    if (time > 0) {
      setTimeout(() => {
        const waiter = waitingStore.get(key)?.shift();
        waiter?.write("*-1\r\n");
      }, time * 1000);
    }
  },
};

export { listCommands };
