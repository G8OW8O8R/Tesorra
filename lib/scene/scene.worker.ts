import { DustEngine } from "./engine";
import type { EngineEvent, HostMessage } from "./protocol";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<HostMessage>) => void) | null;
  postMessage(message: EngineEvent, transfer?: Transferable[]): void;
};

let engine: DustEngine | null = null;

scope.onmessage = ({ data }) => {
  switch (data.type) {
    case "init":
      // Frame data changes hands instead of being copied.
      engine = DustEngine.create(data.canvas, data.options, (event) =>
        scope.postMessage(event, event.type === "frame" ? [event.data.buffer] : []),
      );
      break;
    case "resize":
      engine?.resize(data.width, data.height, data.dpr);
      break;
    case "progress":
      engine?.setProgress(data.value, data.snap);
      break;
    case "reducedMotion":
      engine?.setReducedMotion(data.value);
      break;
    case "visible":
      engine?.setVisible(data.value);
      break;
    case "pointer":
      engine?.setPointer(data.pointer);
      break;
    case "markMask":
      engine?.setMarkMask(data.mask);
      break;
    case "mark":
      engine?.setMark(data.mark);
      break;
    case "dispose":
      engine?.dispose();
      engine = null;
      break;
  }
};
