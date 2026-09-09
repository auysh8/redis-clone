import * as net from "net";

const stringStore = new Map<string, { value: string; expiresAt?: number }>();
const listStore = new Map<string, string[]>();

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
    connection.write(`:${lenOfList}\r\n`);
  },

  LRANGE: (connection, args) => {
    {
      const key = args[0];
      let returnValue = "";
      let countItems = 0;
      if (listStore.has(key)) {
        const list = listStore.get(key) || [];
        let startRange = 0;
        let endRange = 0;
        const listLen = list.length;
        if (Number(args[1]) < 0) {
          startRange = listLen + Number(args[1]);
          if (startRange < 0) {
            startRange = 0;
          }
        } else {
          startRange = Number(args[1]);
        }
        if (Number(args[2]) < 0) {
          endRange = listLen + Number(args[2]);
        } else {
          endRange = Math.min(Number(args[2]), listLen - 1);
        }
        for (let i = startRange; i <= endRange; i++) {
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
      console.log(`$${elementPoped[0]?.length}\r\n${elementPoped[0]}`)
      connection.write(`$${elementPoped[0]?.length}\r\n${elementPoped[0]}\r\n`);
    } else {
      connection.write(`*${elementPoped.length}\r\n${respArr}`);
    }
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
        connection.write(`-ERROR unknow command${command}\r\n`);
      }
    };

    runCommand(command, commandMap);
  });
});

server.listen(6379, "127.0.0.1");
