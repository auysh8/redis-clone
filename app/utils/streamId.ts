import * as net from "net";
import { streamStore } from "../storage/streamStore";

const generateId = (key: string, id: string) => {
  let newId = "";
  const currentTime = Date.now();
  if (streamStore.has(key)) {
    const allEntries = streamStore.get(key) || [];
    let [lastTimeIdStr, lastSeqIdStr] =
      allEntries[allEntries.length - 1].id.split("-");

    if (currentTime == Number(lastTimeIdStr)) {
      lastSeqIdStr = (Number(lastSeqIdStr) + 1).toString();
      newId = `${lastTimeIdStr}-${lastSeqIdStr}`;
    } else {
      newId = `${currentTime}-0`;
    }
  } else {
    newId = `${currentTime}-0`;
  }
  return newId;
};

const generateSeqNum = (key: string, idTime: number) => {
  if (streamStore.has(key)) {
    const allEntries = streamStore.get(key) || [];
    const [lastTimeIdStr, lastSeqIdStr] =
      allEntries[allEntries.length - 1].id.split("-");
    const lastTimeId = Number(lastTimeIdStr);
    const lastSeqId = Number(lastSeqIdStr);
    if (lastTimeId == idTime) {
      return lastSeqId + 1;
    } else if (idTime == 1) {
      return 0;
    }
  } else {
    if (idTime == 0) {
      return 1;
    } else {
      return 0;
    }
  }
};

const xaddIdValidation = (
  key: string,
  connection: net.Socket,
  idTime: number,
  idSequence: number,
) => {
  if (streamStore.has(key)) {
    const allEntries = streamStore.get(key) || [];
    const lastSplitId = allEntries[allEntries?.length - 1].id.split("-");
    const lastIdTime = Number(lastSplitId[0]);
    const lastIdSequence = Number(lastSplitId[1]);
    if (idTime == 0 && idSequence == 0) {
      connection.write(
        "-ERR The ID specified in XADD must be greater than 0-0\r\n",
      );
      return false;
    } else if (
      idTime < lastIdTime ||
      (idTime == lastIdTime && lastIdSequence >= idSequence)
    ) {
      connection.write(
        "-ERR The ID specified in XADD is equal or smaller than the target stream top item\r\n",
      );
      return false;
    }
  }
  return true;
};

export { generateId, generateSeqNum, xaddIdValidation };
