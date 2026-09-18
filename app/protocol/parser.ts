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

export { parseRESP };
