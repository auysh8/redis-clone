
type RespType = "simpleStr" | "bulkStr" | "array" | "integer" | "null";

const encoder = (input: any, type: RespType) => {
  if (type == "simpleStr") {
    const encoded = `+${input}\r\n`;
    return encoded;
  } else if (type == "bulkStr") {
    const encoded = `$${input.length}\r\n${input}\r\n`;
    return encoded;
  } else if (type == "array") {
    let encoded = `*${input.length}\r\n`;
    for (let i = 0; i < input.length; i++) {
      encoded += `$${input[i].length}\r\n${input[i]}\r\n`;
    }
    return encoded;
  } else if (type == "integer") {
    const encoded = `:${input}\r\n`;
    return encoded;
  } else if (type == "null") {
    if (typeof input == "string") {
      return `$-1\r\n`;
    } else if (Array.isArray(input)) {
      return `*-1\r\n`;
    }
  }
};

export { encoder };
