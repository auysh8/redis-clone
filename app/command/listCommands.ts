import * as net from "net";
import { listStore } from "../storage/listStore";
import { encoder } from "../protocol/encoder";
import { retry } from "puppeteer-core/lib/third_party/rxjs/rxjs.js";

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
      waiter?.write(`${encoder([key, popedElement], "array")}`);
      return;
    }
    connection.write(`${encoder(lenOfList, "integer")}`);
    return;
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
      waiter?.write(`${encoder([key, popedElement], "array")}`);
      return;
    }
    connection.write(`${encoder(lenOfList, "integer")}`);
    return;
  },

  LRANGE: (connection, args) => {
    {
      const key = args[0];
      let returnValue = [];
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
          returnValue.push(list[i]);
        }
      }
      console.log(`${encoder(returnValue, "array")}`);
      connection.write(`${encoder(returnValue, "array")}`);
      return;
    }
  },

  LLEN: (connection, args) => {
    const key = args[0];
    if (listStore.has(key)) {
      connection.write(`${encoder(listStore.get(key)?.length, "integer")}`);
      return;
    } else {
      connection.write(`${encoder(0, "integer")}`);
      return;
    }
  },

  LPOP: (connection, args) => {
    const key = args[0];
    let itemsToPop = Number(args[1]) || 1;
    let elementPoped = [];
    if (listStore.has(key)) {
      let itemLen = listStore.get(key)?.length || 0;
      if (itemLen == 0) {
        connection.write(`${encoder("", "null")}`);
        return;
      }
      itemsToPop > itemLen ? (itemsToPop = itemLen) : null;
      for (let i = 0; i < itemsToPop; i++) {
        elementPoped.push(listStore.get(key)?.shift());
      }
    } else {
      connection.write(`${encoder("", "null")}`);
      return;
    }

    let respArr = [];
    for (let i = 0; i < elementPoped.length; i++) {
      respArr.push(elementPoped[i]);
    }

    if (args[1] == undefined) {
      connection.write(`${encoder(elementPoped[0], "bulkStr")}`);
      return;
    } else {
      connection.write(`${encoder(respArr, "array")}`);
      return;
    }
  },

  BLPOP: (connection, args) => {
    const key = args[0];
    const time = Number(args[1]);
    if (listStore.has(key)) {
      const popedElement = listStore.get(key)?.shift();
      connection.write(`${encoder([key, popedElement], "array")}`);
      return;
    }
    if (waitingStore.has(key)) {
      waitingStore.get(key)?.push(connection);
    } else {
      waitingStore.set(key, [connection]);
    }
    if (time > 0) {
      setTimeout(() => {
        const waiter = waitingStore.get(key)?.shift();
        waiter?.write(`${encoder([], "null")}`);
        return;
      }, time * 1000);
    }
  },
};

export { listCommands };
