import * as net from "net";
import { streamStore } from "../storage/streamStore";
import {
  generateId,
  xaddIdValidation,
  generateSeqNum,
} from "../utils/streamId";

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
    connection.write(`$${id.length}\r\n${id}\r\n`);
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
    connection.write(`*${count1}\r\n${respArr}`);
  },

  XREAD: (connection, args) => {
    const keyIdPair = args.slice(1);
    const keys = keyIdPair.slice(0, keyIdPair.length / 2);
    const ids = keyIdPair.slice(keyIdPair.length / 2);
    let keyArr = "";
    for (let k = 0; k < keyIdPair.length / 2; k++) {
      const [idTimeStr, idSeqStr] = ids[k].split("-");
      const idTime = Number(idTimeStr);
      const idSeq = Number(idSeqStr);
      let entryArr = "";
      let entriesCount = 0;
      if (streamStore.has(keys[k])) {
        const allEntries = streamStore.get(keys[k]) || [];
        for (let i = 0; i < allEntries.length; i++) {
          let fieldsArr = "";
          let count = 0;
          const id = allEntries[i].id;
          const fields = allEntries[i].fields;
          const storeTime = Number(allEntries[i].id.split("-")[0]);
          const storeSeq = Number(allEntries[i].id.split("-")[1]);
          for (let j = 0; j < fields.length; j++) {
            const key = fields[j].key;
            const value = fields[j].value;
            count += 2;
            fieldsArr += `$${key.length}\r\n${key}\r\n$${value.length}\r\n${value}\r\n`;
          }
          if (idTime === storeTime && storeSeq > idSeq) {
            entryArr += `*2\r\n$${id.length}\r\n${id}\r\n*${count}\r\n${fieldsArr}\r\n`;
            entriesCount++;
          } else if (idTime < storeTime) {
            entryArr += `*2\r\n$${id.length}\r\n${id}\r\n${fieldsArr}\r\n`;
            entriesCount++;
          }
        }
      }
      keyArr += `$${keys[k].length}\r\n${keys[k]}\r\n*${entriesCount}\r\n${entryArr}\r\n`;
    }

    console.log(`*${keys.length}\r\n*2\r\n${keyArr}\r\n`);
    connection.write(`*${keys.length}\r\n*2\r\n${keyArr}\r\n`);    //write a encoder first
  },
};

export { streamCommands };
