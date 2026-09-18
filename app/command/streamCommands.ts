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
};

export {streamCommands}