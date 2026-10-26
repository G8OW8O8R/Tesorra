"use client";

import { useEffect, useRef, useState } from "react";
import { PortraitCanvas, type PortraitSceneHandle } from "@/components/scene/portrait-canvas";
import { hexToRgb } from "@/lib/scene/math";

/**
 * The store's backdrop: the light dust field, dimmed, in the colour of the part of the store on
 * show (or the drink's flavour). A new colour blends in over a second or so.
 */
export function StoreDust({ colour }: { colour: string }) {
  const scene = useRef<PortraitSceneHandle>(null);
  const [first] = useState(() => hexToRgb(colour));

  useEffect(() => {
    scene.current?.setColour(hexToRgb(colour));
  }, [colour]);

  return <PortraitCanvas ref={scene} colour={first} />;
}
