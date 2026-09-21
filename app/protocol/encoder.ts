type RespType = "simpleStr" | "bulkStr";

const encoder = (input: any, type: RespType) => {
  if (type == "simpleStr") {
    const encoded = `+${input}\r\n`;
    return encoded;
  } else if (type == "bulkStr") {
    const encoded = `$${input.length}\r\n${input}\r\n`;
    return encoded;
  }
};

export { encoder };
