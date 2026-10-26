import { PortraitEngine } from "./portrait";
import type { PortraitEvent, PortraitMessage } from "./portrait-protocol";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PortraitMessage>) => void) | null;
  postMessage(message: PortraitEvent): void;
};

let engine: PortraitEngine | null = null;

scope.onmessage = ({ data }) => {
  switch (data.type) {
    case "init":
      engine = PortraitEngine.create(data.canvas, data.options, (event) => scope.postMessage(event));
      break;
    case "resize":
      engine?.resize(data.width, data.height, data.dpr);
      break;
    case "colour":
      engine?.setColour(data.rgb, data.snap);
      break;
    case "photos":
      engine?.setPhotos(data.photos);
      break;
    case "morph":
      engine?.morph(data.from, data.to);
      break;
    case "pointer":
      engine?.setPointer(data.x, data.y);
      break;
    case "reducedMotion":
      engine?.setReducedMotion(data.value);
      break;
    case "visible":
      engine?.setVisible(data.value);
      break;
    case "dispose":
      engine?.dispose();
      engine = null;
      break;
  }
};
