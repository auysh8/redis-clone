# Redis Clone

An in-memory key-value and data structure store implemented from scratch in TypeScript. The server runs as an asynchronous TCP socket service, natively parses and encodes the Redis Serialization Protocol (RESP), and provides support for core string operations with millisecond TTL eviction, doubly-ended lists with blocking pops, and append-only event streams.

> **Project Status: Active Development**  
> This project is currently in its active development phase and is not yet feature-complete. Core networking, RESP protocol serialization, key-value operations with TTL, lists with blocking pops, and baseline stream operations are implemented. Additional Redis subsystem specifications—including persistence, replication, and transactions—are in progress.

---

## Architectural Overview

This project implements the core network and data layers of a Redis-compatible server without external database dependencies:

- **Network Layer**: Utilizes Node/Bun's native asynchronous `net` TCP socket server on port `6379`, multiplexing concurrent client connections via the runtime event loop.
- **Protocol Serialization & Deserialization**: Implements a custom RESP (Redis Serialization Protocol) engine that deserializes incoming binary payloads and serializes responses across all standard RESP data types.
- **Storage Subsystems**:
  - **Key-Value Store**: In-memory hash map with passive millisecond TTL expiration (`PX`) evaluated at lookup time.
  - **List Store**: In-memory sequence engine supporting push/pop operations from both ends, range slicing, and blocking extraction (`BLPOP`) backed by an asynchronous connection wait queue.
  - **Stream Engine**: Append-only log architecture supporting monotonic ID generation (`<millisecondsTime>-<sequenceNumber>`), boundary validation, range scanning (`XRANGE`), and non-blocking or blocking reads (`XREAD BLOCK`).

---

## RESP Protocol Implementation

The server communicates using RESP over raw TCP sockets. The custom parser and encoder handle:

| RESP Type | Prefix | Description | Example Wire Format |
|---|---|---|---|
| Simple String | `+` | Lightweight status responses | `+OK\r\n` |
| Error | `-` | Protocol and runtime error states | `-ERR unknown command\r\n` |
| Integer | `:` | Numeric values (counts, lengths) | `:42\r\n` |
| Bulk String | `$` | Binary-safe strings with byte length prefix | `$4\r\necho\r\n` |
| Null Bulk String | `$` | Missing or expired keys | `$-1\r\n` |
| Array | `*` | Multi-argument commands and multi-element outputs | `*2\r\n$4\r\necho\r\n$5\r\nhello\r\n` |
| Null Array | `*` | Timeout on blocking operations | `*-1\r\n` |

---

## Supported Command Reference

### Connection Management
- `PING`: Tests connection liveness; returns `+PONG`.
- `ECHO <message>`: Echoes back the supplied string as a bulk string.

### Strings & Key-Value Operations
- `SET <key> <value> [PX <milliseconds>]`: Stores a string value under a key, with optional millisecond-precision expiry.
- `GET <key>`: Retrieves the stored value. Returns `$-1\r\n` if the key does not exist or has passed its expiration threshold.
- `TYPE <key>`: Returns the data type currently stored at the key (`string`, `stream`, `list`, or `none`).

### Lists
- `RPUSH <key> <element...> `: Appends one or multiple elements to the tail of a list. Returns the updated list length.
- `LPUSH <key> <element...>`: Prepends one or multiple elements to the head of a list. Returns the updated list length.
- `LPOP <key> [count]`: Removes and returns the first element (or multiple elements) from the head of the list.
- `LRANGE <key> <start> <stop>`: Returns elements within the specified index boundaries (supports negative offsets).
- `LLEN <key>`: Returns the number of elements contained in the list.
- `BLPOP <key> <timeout>`: Blocking left pop. If the list is empty, suspends the client connection until new items are pushed or the timeout (in seconds) expires.

### Streams
- `XADD <key> <id> <field> <value> ...`: Appends a new entry to a stream. Accepts explicit IDs (`<time>-<seq>`), partial auto-generation (`<time>-*`), or fully automated generation (`*`). Validates that incoming IDs are strictly monotonically increasing.
- `XRANGE <key> <start> <end>`: Queries a range of stream entries between specified time/sequence boundaries (`-` for earliest, `+` for latest).
- `XREAD [BLOCK <milliseconds>] STREAMS <key...> <id...>`: Reads entries from one or more streams with IDs greater than specified thresholds. Supports asynchronous blocking waits (`BLOCK`) for event-driven consumption.

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) (v1.1+) or [Node.js](https://nodejs.org) (v18+)
- Standard `redis-cli` or `netcat` (`nc`) for client interaction

### Installation

Clone the repository and install development dependencies:

```bash
git clone https://github.com/auysh8/redis-clone.git
cd redis-clone
bun install
```

### Running the Server

#### Using Bun (Recommended)
```bash
bun run dev
```

#### Using Node.js
```bash
npm run start:node
```

The server binds to `127.0.0.1:6379`.

---

## Interacting with the Server

### Using standard `redis-cli`
You can interact directly with the running server using standard Redis client tooling:

```bash
redis-cli -p 6379
```

```text
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET user:101 "Pankaj" PX 5000
OK
127.0.0.1:6379> GET user:101
"Pankaj"
127.0.0.1:6379> RPUSH tasks "task-1" "task-2"
(integer) 2
127.0.0.1:6379> LRANGE tasks 0 -1
1) "task-1"
2) "task-2"
127.0.0.1:6379> XADD mystream * sensor-id "temp-01" value "24.5"
"1711280000000-0"
127.0.0.1:6379> XRANGE mystream - +
1) 1) "1711280000000-0"
   2) 1) "sensor-id"
      2) "temp-01"
      3) "value"
      4) "24.5"
```

### Using Raw TCP (`netcat`)
Commands can also be tested directly over raw TCP sockets using RESP framing:

```bash
printf "*3\r\n\$3\r\nSET\r\n\$4\r\nname\r\n\$6\r\nPankaj\r\n" | nc 127.0.0.1 6379
```

Output:
```text
+OK
```

---

## Project Structure

```text
redis-clone/
├── app/
│   ├── main.ts                    # Entry point: TCP server initialization & event loop handling
│   ├── command/
│   │   ├── index.ts               # Command routing table aggregation
│   │   ├── connectionCommands.ts  # PING, ECHO implementations
│   │   ├── kvCommands.ts          # GET, SET (with PX expiry), TYPE
│   │   ├── listCommands.ts        # LPUSH, RPUSH, LPOP, LRANGE, LLEN, BLPOP
│   │   └── streamCommands.ts      # XADD, XRANGE, XREAD (blocking queues)
│   ├── protocol/
│   │   ├── parser.ts              # RESP deserializer (Tokens extraction)
│   │   └── encoder.ts             # RESP serializer (Simple string, Bulk string, Array, Integer)
│   ├── storage/
│   │   ├── kvStore.ts             # In-memory key-value state
│   │   ├── listStore.ts           # In-memory list collections
│   │   └── streamStore.ts         # In-memory stream logs
│   └── utils/
│       └── streamId.ts            # Monotonic ID generator and boundary validation
├── package.json
└── tsconfig.json
```

---

## Technical Considerations

- **Single-Threaded Event Loop Concurrency**: Like Redis, data mutations execute in-memory on the JavaScript runtime event loop, eliminating complex multithreaded locking while maintaining safe concurrent state access.
- **Asynchronous Blocking Mechanisms**: Blocking operations (`BLPOP`, `XREAD BLOCK`) park client connections in a non-polling waiter queue (`Map<string, net.Socket[]>`) using timer timeouts, immediately waking up when a write command targets the observed key.
- **Passive Memory Eviction**: Keys configured with TTL (`PX`) maintain timestamp metadata and are evicted lazily upon lookup, minimizing background maintenance overhead.

---

## Implementation Status & Roadmap

The project is under active iteration. Subsystem progress is tracked below:

- [x] TCP socket server on port 6379 with connection multiplexing
- [x] Complete RESP parser and serializer (Strings, Integers, Arrays, Nulls, Errors)
- [x] Connection handshake (`PING`, `ECHO`)
- [x] Key-value store with millisecond TTL expiration (`GET`, `SET [PX]`, `TYPE`)
- [x] Doubly-ended lists (`LPUSH`, `RPUSH`, `LPOP`, `LRANGE`, `LLEN`)
- [x] Asynchronous blocking list operations (`BLPOP` with timeout queue)
- [x] Append-only event streams (`XADD`, `XRANGE`, `XREAD [BLOCK]`)
- [ ] RDB snapshot parsing and disk persistence
- [ ] Master-replica replication handshake (`PSYNC`, `REPLCONF`)
- [ ] Atomic multi-key transactions (`MULTI`, `EXEC`, `DISCARD`)
