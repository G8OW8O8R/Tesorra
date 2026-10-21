import { DustEngine } from "./engine";
import type { EngineEvent, HostMessage } from "./protocol";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<HostMessage>) => void) | null;
  postMessage(message: EngineEvent): void;
};

let engine: DustEngine | null = null;

scope.onmessage = ({ data }) => {
  switch (data.type) {
    case "init":
      engine = DustEngine.create(data.canvas, data.options, (event) => scope.postMessage(event));
      break;
    case "resize":
      engine?.resize(data.width, data.height, data.dpr);
      break;
    case "progress":
      engine?.setProgress(data.value);
      break;
    case "reducedMotion":
      engine?.setReducedMotion(data.value);
      break;
    case "visible":
      engine?.setVisible(data.value);
      break;
    case "pointer":
      engine?.setPointer(data.x, data.y, data.active);
      break;
    case "dispose":
      engine?.dispose();
      engine = null;
      break;
  }
};
