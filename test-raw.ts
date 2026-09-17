import * as net from "net";

const client = new net.Socket();

function sendCommand(cmd: string[]): Promise<string> {
  return new Promise((resolve) => {
    let payload = `*${cmd.length}\r\n`;
    for (const arg of cmd) {
      payload += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
    }

    const onData = (data: Buffer) => {
      client.off("data", onData);
      resolve(data.toString());
    };

    client.on("data", onData);
    client.write(payload);
  });
}

function assert(name: string, actual: string, expected: string) {
  if (actual.trim() === expected.trim()) {
    console.log(`✔ PASS: ${name}`);
  } else {
    console.error(`✖ FAIL: ${name}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Got:      ${JSON.stringify(actual)}`);
  }
}

async function runTests() {
  await new Promise<void>((resolve) => client.connect(6379, "127.0.0.1", resolve));
  console.log("Connected to server via Raw TCP Socket.\n");

  // 1. Basic PING & ECHO
  assert("PING", await sendCommand(["PING"]), "+PONG\r\n");
  assert("ECHO", await sendCommand(["ECHO", "hello"]), "$5\r\nhello\r\n");

  // 2. SET & GET
  assert("SET key", await sendCommand(["SET", "msg", "world"]), "+OK\r\n");
  assert("GET key", await sendCommand(["GET", "msg"]), "$5\r\nworld\r\n");

  // 3. SET PX (Expiry)
  await sendCommand(["SET", "temp", "val", "PX", "200"]);
  assert("GET temp before expiry", await sendCommand(["GET", "temp"]), "$3\r\nval\r\n");
  await new Promise((r) => setTimeout(r, 250));
  assert("GET temp after expiry", await sendCommand(["GET", "temp"]), "$-1\r\n");

  // 4. Lists (RPUSH, LPUSH, LLEN, LRANGE, LPOP)
  assert("RPUSH", await sendCommand(["RPUSH", "mylist", "b", "c"]), ":2\r\n");
  assert("LPUSH", await sendCommand(["LPUSH", "mylist", "a"]), ":3\r\n");
  assert("LLEN", await sendCommand(["LLEN", "mylist"]), ":3\r\n");
  assert(
    "LRANGE 0 -1",
    await sendCommand(["LRANGE", "mylist", "0", "-1"]),
    "*3\r\n$1\r\na\r\n$1\r\nb\r\n$1\r\nc\r\n"
  );
  assert("LPOP single", await sendCommand(["LPOP", "mylist"]), "$1\r\na\r\n");

  // 5. Streams (XADD validation & generation)
  assert(
    "XADD reject 0-0",
    await sendCommand(["XADD", "mystream", "0-0", "k", "v"]),
    "-ERR The ID specified in XADD must be greater than 0-0\r\n"
  );
  assert("XADD entry 1", await sendCommand(["XADD", "mystream", "0-1", "fruit", "apple"]), "$3\r\n0-1\r\n");
  assert("XADD entry 2", await sendCommand(["XADD", "mystream", "0-2", "fruit", "banana"]), "$3\r\n0-2\r\n");
  assert("XADD entry 3", await sendCommand(["XADD", "mystream", "0-3", "fruit", "orange"]), "$3\r\n0-3\r\n");

  // 6. XRANGE
  assert(
    "XRANGE 0-2 0-3",
    await sendCommand(["XRANGE", "mystream", "0-2", "0-3"]),
    "*2\r\n$3\r\n0-2\r\n*2\r\n$5\r\nfruit\r\n$6\r\nbanana\r\n$3\r\n0-3\r\n*2\r\n$5\r\nfruit\r\n$6\r\norange\r\n"
  );

  client.end();
  console.log("\nFinished testing!");
}

runTests().catch(console.error);