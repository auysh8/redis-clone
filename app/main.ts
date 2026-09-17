import { time } from "console";
import * as net from "net";
import { start } from "repl";
type StreamEntries = {
  id: string;
  fields: { key: string; value: string }[];
};
const stringStore = new Map<string, { value: string; expiresAt?: number }>();
const listStore = new Map<string, string[]>();
const waitingStore = new Map<string, net.Socket[]>();
const streamStore = new Map<string, StreamEntries[]>();

// For parsing RESP commands
const parseRESP = (data: Buffer) => {
  const dataArr = data.toString().split("\r\n");
  const tokens = [];
  for (let i = 2; i < dataArr.length; i += 2) {
    tokens.push(dataArr[i]);
  }
  const commandTokens = {
    command: tokens[0].toUpperCase(),
    args: tokens.slice(1),
  };
  return commandTokens;
};

const generateId = (key: string, id: string) => {
  let newId = "";
  const currentTime = Date.now();
  if (streamStore.has(key)) {
    const allEntries = streamStore.get(key) || [];
    let [lastTimeIdStr, lastSeqIdStr] =
      allEntries[allEntries.length - 1].id.split("-");

    if (currentTime == Number(lastTimeIdStr)) {
      lastSeqIdStr = (Number(lastSeqIdStr) + 1).toString();
      newId = `${lastTimeIdStr}-${lastSeqIdStr}`;
    } else {
      newId = `${currentTime}-0`;
    }
  } else {
    newId = `${currentTime}-0`;
  }
  return newId;
};

const generateSeqNum = (key: string, idTime: number) => {
  if (streamStore.has(key)) {
    const allEntries = streamStore.get(key) || [];
    const [lastTimeIdStr, lastSeqIdStr] =
      allEntries[allEntries.length - 1].id.split("-");
    const lastTimeId = Number(lastTimeIdStr);
    const lastSeqId = Number(lastSeqIdStr);
    if (lastTimeId == idTime) {
      return lastSeqId + 1;
    } else if (idTime == 1) {
      return 0;
    }
  } else {
    if (idTime == 0) {
      return 1;
    } else {
      return 0;
    }
  }
};

const xaddIdValidation = (
  key: string,
  connection: net.Socket,
  idTime: number,
  idSequence: number,
) => {
  if (streamStore.has(key)) {
    const allEntries = streamStore.get(key) || [];
    const lastSplitId = allEntries[allEntries?.length - 1].id.split("-");
    const lastIdTime = Number(lastSplitId[0]);
    const lastIdSequence = Number(lastSplitId[1]);
    if (idTime == 0 && idSequence == 0) {
      connection.write(
        "-ERR The ID specified in XADD must be greater than 0-0\r\n",
      );
      return false;
    } else if (
      idTime < lastIdTime ||
      (idTime == lastIdTime && lastIdSequence >= idSequence)
    ) {
      connection.write(
        "-ERR The ID specified in XADD is equal or smaller than the target stream top item\r\n",
      );
      return false;
    }
  }
  return true;
};

//contains all the commands and thier callback functions
const commandMap: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
  PING: (connection) => connection.write("+PONG\r\n"),

  ECHO: (connection, args) =>
    connection.write(`$${args[0].length}\r\n${args[0]}\r\n`),

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

  XADD: (connection, args) => {
    const key = args[0];
    let id = args[1];
    if (id === "*") {
      id = generateId(key, id);
    } else {
      const [timeStr, sequenceStr] = id.split("-");
      const idTime = Number(timeStr);
      let idSequence: number;
      if (sequenceStr == "*") {
        idSequence = Number(generateSeqNum(key, idTime));
      } else {
        idSequence = Number(sequenceStr);
      }

      if (xaddIdValidation(key, connection, idTime, idSequence) == false) {
        return null;
      }

      id = `${idTime}-${idSequence}`;
    }

    let fields = [];
    for (let i = 2; i < args.length; i = i + 2) {
      let entry = { key: args[i], value: args[i + 1] };
      fields.push(entry);
    }
    const streamData = { id, fields };

    if (streamStore.has(key)) {
      streamStore.get(key)?.push(streamData);
    } else {
      streamStore.set(key, [streamData]);
    }
    connection.write(`$${id.length}\r\n${id}\r\n`);
  },
  XRANGE: (connection, args) => {
    const key = args[0];
    const [startTimeStr, startSeqStr = 0] = args[1].split("-");
    const [endTimeStr, endSeqStr = Infinity] = args[2].split("-");
    const startTime = Number(startTimeStr);
    const endTime = Number(endTimeStr);
    const startSeq = Number(startSeqStr);
    const endSeq = Number(endSeqStr);

    const requiredEntries = [];
    if (streamStore.has(key)) {
      const allEntries = streamStore.get(key) || [];
      for (let i = 0; i < allEntries?.length; i++) {
        const timeId = Number(allEntries[i].id.split("-")[0]);
        const seqId = Number(allEntries[i].id.split("-")[1]);
        if (startTime === endTime) {
          if (timeId === startTime && startSeq <= seqId && endSeq >= seqId) {
            requiredEntries.push(allEntries[i]);
          }
        } else {
          if (timeId > startTime && timeId < endTime) {
            requiredEntries.push(allEntries[i]);
          } else if (
            timeId == startTime &&
            timeId != endTime &&
            seqId >= startSeq
          ) {
            requiredEntries.push(allEntries[i]);
          } else if (
            timeId == endTime &&
            timeId != startTime &&
            seqId <= endSeq
          ) {
            requiredEntries.push(allEntries[i]);
          }
        }
      }
    }
    let respArr = "";
    let count1 = 0;
    for (let i = 0; i < requiredEntries.length; i++) {
      const id = requiredEntries[i].id;
      const fields = requiredEntries[i].fields;
      let fieldsArr = "";
      let count2 = 0;
      for (let j = 0; j < fields.length; j++) {
        const key = fields[j].key;
        const value = fields[j].value;
        fieldsArr += `$${key.length}\r\n${key}\r\n$${value.length}\r\n${value}\r\n`;
        count2 += 2;
      }
      respArr += `*2\r\n$${id.length}\r\n${id}\r\n*${count2}\r\n${fieldsArr}`;
      count1++;
    }
    // console.log(`*${count1}\r\n${respArr}`);
    connection.write(`*${count1}\r\n${respArr}`);
  },
  // Inside your commandMap in server.ts:
  HELLO: (connection) => {
    // Return an error telling the client to fall back to RESP2, or return a basic RESP2 map
    connection.write("-ERR unknown command 'HELLO'\r\n");
    // Alternatively, if you want ioredis to proceed silently:
    // connection.write("%0\r\n"); // empty RESP3 map
  },

  COMMAND: (connection) => {
    // Many Redis clients send 'COMMAND' or 'COMMAND DOCS' on startup
    connection.write("*0\r\n"); // return empty array
  },
};

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    const commandTokens = parseRESP(data); //convert the RESP command to something usefull
    const command: string = commandTokens.command; //extract the command from command tokens

    // run commands
    const runCommand = (
      command: string,
      commandMap: Record<
        string,
        (connection: net.Socket, args: string[]) => void
      >,
    ) => {
      const commandHandler = commandMap[command];

      if (commandHandler) {
        commandHandler(connection, commandTokens.args);
      } else {
        connection.write(`-ERR unknown command '${command}'\r\n`);
      }
    };

    runCommand(command, commandMap);
  });
});

server.listen(6379, "127.0.0.1");
