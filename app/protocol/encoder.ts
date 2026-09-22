type RespType = "simpleStr" | "bulkStr" | "array" | "integer" | "null";

const encoder = (input: any, type?: RespType) => {
  if (type == "null") {
    if (typeof input == "string") {
      return `$-1\r\n`;
    } else if (Array.isArray(input)) {
      return `*-1\r\n`;
    }
  } else if (type == "simpleStr") {
    const encoded = `+${input}\r\n`;
    return encoded;
  } else if (typeof input == "string") {
    const encoded = `$${input.length}\r\n${input}\r\n`;
    return encoded;
  } else if (Array.isArray(input)) {
    let encoded = `*${input.length}\r\n`;
    for (let i = 0; i < input.length; i++) {
      encoded += encoder(input[i]);
    }
    return encoded;
  } else if (typeof input == "number") {
    const encoded = `:${input}\r\n`;
    return encoded;
  }
};

export { encoder };
