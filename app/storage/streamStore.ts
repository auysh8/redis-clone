type StreamEntries = {
  id: string;
  fields: { key: string; value: string }[];
};

const streamStore = new Map<string, StreamEntries[]>();

export { streamStore };
