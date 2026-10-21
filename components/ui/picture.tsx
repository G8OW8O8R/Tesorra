import type { ComponentProps } from "react";
import { fallbackSrc, images, srcSet, type ImageKey } from "@/lib/images";

type PictureProps = Omit<ComponentProps<"img">, "src" | "srcSet" | "width" | "height"> & {
  image: ImageKey;
  alt: string;
  sizes: string;
};

/** Responsive AVIF/WebP image from the generated set in public/img. */
export function Picture({ image, alt, sizes, loading = "lazy", ...props }: PictureProps) {
  const asset = images[image];
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(image, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(image, "webp")} sizes={sizes} />
      <img
        src={fallbackSrc(image)}
        width={asset.width}
        height={asset.height}
        alt={alt}
        sizes={sizes}
        loading={loading}
        decoding="async"
        {...props}
      />
    </picture>
  );
}
