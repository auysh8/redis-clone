import * as net from "net";
import { streamStore } from "../storage/streamStore";
import {
  generateId,
  xaddIdValidation,
  generateSeqNum,
} from "../utils/streamId";
import { encoder } from "../protocol/encoder";

const waitingStore = new Map<string, { connection: net.Socket; id: string }>();

const handleXread = (keyIdPair: string[]) => {
  const keys = keyIdPair.slice(0, keyIdPair.length / 2);
  const ids = keyIdPair.slice(keyIdPair.length / 2);
  let keyArr = [];
  for (let k = 0; k < keyIdPair.length / 2; k++) {
    const [idTimeStr, idSeqStr] = ids[k].split("-");
    const idTime = Number(idTimeStr);
    const idSeq = Number(idSeqStr);
    let entryArr = [];
    if (streamStore.has(keys[k])) {
      const allEntries = streamStore.get(keys[k]) || [];
      for (let i = 0; i < allEntries.length; i++) {
        let fieldsArr = [];
        const id = allEntries[i].id;
        const fields = allEntries[i].fields;
        const storeTime = Number(allEntries[i].id.split("-")[0]);
        const storeSeq = Number(allEntries[i].id.split("-")[1]);
        for (let j = 0; j < fields.length; j++) {
          const key = fields[j].key;
          const value = fields[j].value;
          fieldsArr.push(key, value);
        }
        if (idTime === storeTime && storeSeq > idSeq) {
          entryArr.push([id, fieldsArr]);
        } else if (idTime < storeTime) {
          entryArr.push(id, fieldsArr);
        }
      }
    }
    if (entryArr.length == 0) {
      return null;
    }
    keyArr.push([keys[k], entryArr]);
  }
  // console.log(keyArr);
  return keyArr;
};

const streamCommands: Record<
  string,
  (connection: net.Socket, args: string[]) => void
> = {
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
    const waiting = waitingStore.get(key);
    if (waiting) {
      const keyIdPair = [key, waiting.id];
      const keyArr = handleXread(keyIdPair);
      waiting.connection.write(`${encoder(keyArr)}`);
      waitingStore.delete(key);
      return;
    }
    connection.write(`${encoder(id, "bulkStr")}`);
    return;
  },

  XRANGE: (connection, args) => {
    const key = args[0];
    const [startTimeStr, startSeqStr = 0] = args[1].split("-");
    const [endTimeStr, endSeqStr = Infinity] = args[2].split("-");
    const startTime = Number(startTimeStr);
    const endTime = endTimeStr == "+" ? Infinity : Number(endTimeStr);
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
    let respArr = [];
    for (let i = 0; i < requiredEntries.length; i++) {
      const id = requiredEntries[i].id;
      const fields = requiredEntries[i].fields;
      let fieldsArr = [];
      for (let j = 0; j < fields.length; j++) {
        const key = fields[j].key;
        const value = fields[j].value;
        fieldsArr.push(key, value);
      }
      respArr.push([id, fieldsArr]);
    }
    connection.write(`${encoder(respArr)}`);
    return;
  },

  XREAD: (connection, args) => {
    let waitTime = 0;
    if (args[0].toUpperCase() == "BLOCK") {
      waitTime = Number(args[1]);
      const keyIdPair = args.slice(3);
      const key = keyIdPair[0];
      const id = keyIdPair[1];
      if (streamStore.has(key)) {
        const keyArr = handleXread(keyIdPair);
        if (keyArr != null) {
          connection.write(`${encoder(keyArr)}`);
          return;
        }
        waitingStore.set(key, { connection, id });
        if (waitTime > 0) {
          setTimeout(() => {
            waitingStore.delete(key);
            connection.write(`${encoder([], "null")}`);
            return;
          }, waitTime);
        }
      } else {
        waitingStore.set(key, { connection, id });
        if (waitTime > 0) {
          setTimeout(() => {
            waitingStore.delete(key);
            connection.write(`${encoder([], "null")}`);
            return;
          }, waitTime);
        }
      }
    } else {
      const keyIdPair = args.slice(1);
      const keyArr = handleXread(keyIdPair);
      connection.write(`${encoder(keyArr)}`);
      return;
    }
  },
};
export { streamCommands };
